from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def ensure_schema_columns(bind=None):
    """Adds columns introduced after a table was first created (lightweight migration)."""
    from sqlalchemy import inspect, text

    bind = bind or engine
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    with bind.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                col_type = column.type.compile(dialect=bind.dialect)
                default = ""
                if column.default is not None and not callable(column.default.arg):
                    default = f" DEFAULT {column.default.arg!r}"
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}{default}'))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
