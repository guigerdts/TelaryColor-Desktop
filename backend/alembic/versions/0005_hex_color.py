"""add hex_color to pantone_colors

Revision ID: 0005_hex_color
Revises: 0004_designs
Create Date: 2026-08-31

Additive migration adding a nullable ``hex_color`` (VARCHAR) column to the
``pantone_colors`` table.  The column stores the publicly published sRGB hex
approximation for each Pantone C-coated code; it is nullable so existing rows
are unaffected.

The downgrade drops only the hex_color column added by this migration, in
keeping with linearly reversible migrations.  The 0004 additions
(design_id, formula_designs, client/notes) are removed by
0004_designs.downgrade() and are NOT repeated here: a migration that
double-undoes a previous migration breaks any multi-step downgrade chain
(e.g. ``alembic downgrade -1`` only from head, or ``downgrade
0002_samples`` running 0006 → 0005 → 0004 → 0003) because the objects are
already gone when the neighbour downgrade runs.  Every Fase 1/2/3 table
and row survives unchanged.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0005_hex_color"
down_revision = "0004_designs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pantone_colors", sa.Column("hex_color", sa.String(), nullable=True)
    )


def downgrade() -> None:
    # Undo only the 0005 addition: the hex_color column.
    #
    # 0004_designs.downgrade() is responsible for its own additions
    # (design_id, formula_designs, client/notes).  Downgrades must be
    # linearly reversible: each migration removes exactly what its own
    # upgrade added.  A migration that reaches back into a previous
    # migration's schema double-undoes it whenever Alembic runs a chain
    # through both revisions (e.g. head → 0002_samples), which breaks the
    # downgrade with KeyError / "no such column".
    op.drop_column("pantone_colors", "hex_color")
