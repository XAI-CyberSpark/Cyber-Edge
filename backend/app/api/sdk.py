from fastapi import APIRouter
from fastapi.responses import Response

from app.schemas.sdk_schema import SDKExportRequest
from app.services.sdk_service import SDKService


router = APIRouter()


@router.post("/export")
async def export_sdk(request: SDKExportRequest):
    filename, archive_bytes = SDKService.build_sdk_archive(
        name=request.name,
        nodes=request.nodes,
        edges=request.edges,
        package_name=request.package_name,
        default_model=request.default_model,
    )

    return Response(
        content=archive_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
