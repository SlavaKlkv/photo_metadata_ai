from pydantic import BaseModel

from app.core.enums import ExportFormat


class ExportArtifact(BaseModel):
    """
    Описание одного экспортного артефакта.
    """

    export_format: ExportFormat
    path: str
    filename: str
    size_bytes: int
    count: int = 1
