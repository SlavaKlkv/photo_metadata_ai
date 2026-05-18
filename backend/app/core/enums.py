from enum import StrEnum


class FileStatus(StrEnum):
    QUEUED = 'queued'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


class JobStatus(StrEnum):
    QUEUED = 'queued'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


class AIProvider(StrEnum):

    MOCK = 'mock'
    OLLAMA = 'ollama'
    CLAUDE = 'claude'
    OPENAI = 'openai'


class StockPlatform(StrEnum):
    SHUTTERSTOCK = 'shutterstock'
    GETTY_IMAGES = 'getty_images'
    ADOBE_STOCK = 'adobe_stock'


class ExportFormat(StrEnum):
    CSV = 'csv'
    IPTC = 'iptc'
    JSON = 'json'
