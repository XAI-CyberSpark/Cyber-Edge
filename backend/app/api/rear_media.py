"""Local rear-seat demo video, behind the application's normal access middleware."""
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
router = APIRouter()
DEMO_VIDEO = Path(__file__).resolve().parents[3] / '.demo-runtime' / 'rear-seat-demo.mp4'

@router.get('/rear-seat')
def rear_seat_video():
    if not DEMO_VIDEO.is_file():
        raise HTTPException(status_code=404, detail='后排演示视频尚未配置。')
    return FileResponse(DEMO_VIDEO, media_type='video/mp4', headers={'Cache-Control': 'private, no-store'})
