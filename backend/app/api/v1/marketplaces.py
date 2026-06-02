from fastapi import APIRouter, HTTPException

from app.core.enums import StockPlatform
from app.schemas.marketplace import (
    MarketplaceConnectionsResponse,
    MarketplaceConnectionState,
    MarketplaceCredentialsRequest,
    MarketplaceCredentialsStoredResponse,
    MarketplaceValidationResponse,
)
from app.services.marketplace_connection import (
    validate_marketplace_credentials,
)
from app.services.marketplace_credentials import (
    delete_marketplace_credentials,
    get_marketplace_connection,
    list_marketplace_connections,
    save_marketplace_credentials,
)

router = APIRouter(
    prefix='/marketplaces',
    tags=['marketplaces'],
)


@router.get('/connections', response_model=MarketplaceConnectionsResponse)
async def list_connections():
    return await list_marketplace_connections()


@router.get(
    '/{marketplace}/connection',
    response_model=MarketplaceConnectionState,
)
async def get_connection(marketplace: StockPlatform):
    return await get_marketplace_connection(marketplace)


@router.post(
    '/{marketplace}/validate',
    response_model=MarketplaceValidationResponse,
)
async def validate_credentials(
    marketplace: StockPlatform,
    credentials: MarketplaceCredentialsRequest,
):
    return await validate_marketplace_credentials(marketplace, credentials)


@router.put(
    '/{marketplace}/credentials',
    response_model=MarketplaceCredentialsStoredResponse,
)
async def save_credentials(
    marketplace: StockPlatform,
    credentials: MarketplaceCredentialsRequest,
):
    connection = await save_marketplace_credentials(marketplace, credentials)

    if not connection.connected:
        raise HTTPException(
            status_code=400,
            detail={
                'message': 'Invalid marketplace credentials',
                'marketplace': marketplace.value,
                'error': (
                    connection.error.model_dump()
                    if connection.error is not None
                    else None
                ),
            },
        )

    return MarketplaceCredentialsStoredResponse(connection=connection)


@router.delete(
    '/{marketplace}/credentials',
    response_model=MarketplaceConnectionState,
)
async def delete_credentials(marketplace: StockPlatform):
    return await delete_marketplace_credentials(marketplace)
