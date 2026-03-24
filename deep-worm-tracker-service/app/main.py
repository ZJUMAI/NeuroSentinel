"""
Deep-Worm-Tracker 线虫运动追踪 Web API
基于 YOLOv5/ultralytics 检测 + 内置追踪，对线虫视频进行多目标追踪。
参考：修改2.23.md，PLOS ONE 10.1371/journal.pone.0281797，Zenodo 7884831
"""
import json
import os
import shutil
from pathlib import Path
from typing import Any, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

app = FastAPI(title="Deep-Worm-Tracker API", version="1.0.0")

# 模型路径：优先使用 Zenodo 下载的线虫专用权重
MODELS_DIR = Path("/app/models")
CUSTOM_WORM_MODEL = MODELS_DIR / "yolov5_worm.pt"
FALLBACK_MODEL = "yolov8n.pt"  # ultralytics 内置，通用检测

_tracker = None


def get_tracker():
    """延迟加载模型，避免启动时阻塞"""
    global _tracker
    if _tracker is None:
        try:
            from ultralytics import YOLO
            if CUSTOM_WORM_MODEL.exists():
                _tracker = YOLO(str(CUSTOM_WORM_MODEL))
            else:
                _tracker = YOLO(FALLBACK_MODEL)
        except Exception as e:
            raise RuntimeError(f"Failed to load model: {e}")
    return _tracker


def _is_video(filename: str) -> bool:
    ext = (filename or "").lower().split(".")[-1]
    return ext in ("mp4", "avi", "mov", "mkv", "webm")


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok", "service": "deep-worm-tracker"}


@app.post("/analyze/v2/tracking")
async def analyze_tracking(
    file: UploadFile = File(...),
    options: Optional[str] = Form(None),
):
    """
    对线虫运动视频进行多目标追踪。
    输入：视频文件（MP4/AVI/MOV）
    输出：每条线虫的 ID、边界框、置信度、轨迹数据
    参考：修改2.23.md
    """
    if not _is_video(file.filename or ""):
        raise HTTPException(
            status_code=400,
            detail="请上传视频文件（MP4/AVI/MOV）。图像分析请使用 ImageJ 服务。",
        )

    opts: dict = {}
    if options:
        try:
            opts = json.loads(options)
        except json.JSONDecodeError:
            pass

    temp_path = f"/tmp/{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        model = get_tracker()
        # persist=True 保持跨帧 ID
        results = model.track(source=temp_path, persist=True, verbose=False)

        tracks: List[dict] = []
        frame_idx = 0
        for r in results:
            if r.boxes is not None:
                boxes = r.boxes
                for i in range(len(boxes)):
                    box = boxes[i]
                    xyxy = box.xyxy.cpu().numpy()
                    conf = float(box.conf.cpu().numpy()[0]) if box.conf is not None else 0.0
                    track_id = int(box.id.cpu().numpy()[0]) if box.id is not None else -1
                    tracks.append({
                        "frame": frame_idx,
                        "id": track_id,
                        "bbox": xyxy[0].tolist(),
                        "confidence": round(conf, 4),
                    })
            frame_idx += 1

        # 统计唯一 ID 数量
        unique_ids = {t["id"] for t in tracks if t["id"] >= 0}
        count = len(unique_ids) if unique_ids else 0

        return {
            "status": "success",
            "filename": file.filename,
            "count": count,
            "total_detections": len(tracks),
            "tracks": tracks[:500],  # 限制返回数量，避免响应过大
            "details": {
                "model": "custom" if CUSTOM_WORM_MODEL.exists() else "fallback",
                "frames_processed": frame_idx,
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
