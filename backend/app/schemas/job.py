from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class FileStatus(StrEnum):
    QUEUED = 'queued'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'


class JobStatus(StrEnum):
    QUEUED = 'queued'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'


class ProcessingJobFile(BaseModel):
    file_id: UUID = Field(default_factory=uuid4)
    filename: str
    original_filename: str
    status: FileStatus = FileStatus.QUEUED
    title: str | None = None
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    error_message: str | None = None


class CreateProcessingJobFile(BaseModel):
    original_filename: str


class CreateProcessingJobRequest(BaseModel):
    files: list[CreateProcessingJobFile] = Field(default_factory=list)


class ProcessingJob(BaseModel):
    job_id: UUID = Field(default_factory=uuid4)
    status: JobStatus = JobStatus.QUEUED
    files: list[ProcessingJobFile] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
