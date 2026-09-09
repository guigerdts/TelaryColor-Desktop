"""add designs.client/notes, formula_designs, inventory_transactions.design_id

Revision ID: 0004_designs
Revises: 0003_inventory
Create Date: 2026-08-30

Additive, handwritten migration growing the schema from the Fase 3 baseline
(0003_inventory) to eleven domain tables: it adds the nullable
``client``/``notes`` columns to ``designs`` (designs spec "Client Field"/
"Notes Field"), creates ``formula_designs`` — the formula↔design usage link
with a REAL ``UNIQUE(formula_id, design_id)`` constraint (formula-designs
spec "Formula-Design Link Data Model", design D2) — and adds the nullable
``design_id`` to ``inventory_transactions`` (inventory spec "Design
Reference on Consumption Transactions"). No Fase 1/2/3 table or column is
touched apart from those nullable additions.

The downgrade drops exactly the 0004 additions — the new table and the three
new columns — leaving every Fase 1/2/3 table and row intact (spec scenarios
"Downgrade is additive-safe"): it never removes pre-existing columns, so the
downgrade cannot destroy older data.

Column types mirror the SQLAlchemy 2.0 models in
``app/modules/designs/models.py`` (``Design``/``FormulaDesign``) and
``app/modules/inventory/models.py`` (``InventoryTransaction``): the
``source`` enum is stored as VARCHAR (SQLite has no native enum, design
ADR-5), timestamps as naive-UTC DATETIME.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0004_designs"
down_revision = "0003_inventory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # designs.client / designs.notes — nullable, additive (designs spec).
    op.add_column("designs", sa.Column("client", sa.String(), nullable=True))
    op.add_column("designs", sa.Column("notes", sa.Text(), nullable=True))

    # formula_designs — the recipe-usage link (formula-designs spec); the
    # UniqueConstraint is the database-level pair guarantee.
    op.create_table(
        "formula_designs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "formula_id",
            sa.Integer(),
            sa.ForeignKey("formulas.id"),
            nullable=False,
        ),
        sa.Column(
            "design_id",
            sa.Integer(),
            sa.ForeignKey("designs.id"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("formula_id", "design_id", name="uq_formula_design"),
    )

    # inventory_transactions.design_id — nullable, additive (inventory spec).
    # SQLite cannot ALTER a constraint, so the FK-bearing column add uses
    # batch mode (Alembic copy-and-move strategy).
    with op.batch_alter_table("inventory_transactions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "design_id",
                sa.Integer(),
                sa.ForeignKey(
                    "designs.id", name="fk_inventory_transactions_design_id"
                ),
                nullable=True,
            )
        )


def downgrade() -> None:
    # Drop only the 0004 additions, in FK-safe order: the referencing column
    # first, then the join table, then designs' new columns. Every Fase
    # 1/2/3 table and column survives unchanged.
    #
    # SQLite cannot ALTER a constraint and refuses to DROP COLUMN while a
    # table-level FK references it, so the design_id removal also runs in
    # batch mode: the FK constraint is dropped first, then the column, in a
    # single copy-and-move pass. Batch mode DOES reflect foreign keys by
    # name here (proven by the running downgrade chain); the historical
    # KeyError was a double-undo from 0005_hex_color.downgrade, which used
    # to drop these same 0004 additions before this migration ran.
    with op.batch_alter_table("inventory_transactions") as batch_op:
        batch_op.drop_constraint(
            "fk_inventory_transactions_design_id", type_="foreignkey"
        )
        batch_op.drop_column("design_id")
    op.drop_table("formula_designs")
    op.drop_column("designs", "client")
    op.drop_column("designs", "notes")