"""
Neorual 线虫显微图像分析 Web API
ViT 分类、串珠分割、细胞体实例分割
接收 multipart 文件上传，返回 base64 结果图
"""
import base64
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile

# 项目根 = /app（Docker 内）
APP_ROOT = Path("/app")
NEORUAL_ROOT = APP_ROOT / "neorual-analysis"
PROJECT_ROOT = APP_ROOT

app = FastAPI(title="Neorual Nematode Analysis API", version="1.0.0")


def _run_script(script_name: str, img_path: str, out_dir: str, extra_args: list | None = None) -> tuple[bool, str, list[str]]:
    """运行 Python 脚本，返回 (success, error_msg, image_paths)"""
    import subprocess
    script = NEORUAL_ROOT / script_name
    if not script.exists():
        return False, f"Script not found: {script}", []
    args = ["python", str(script), "--img", img_path, "--out-dir", out_dir]
    if extra_args:
        args.extend(extra_args)
    try:
        result = subprocess.run(
            args,
            cwd=str(APP_ROOT),
            env={**os.environ, "PYTHONPATH": str(APP_ROOT)},
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode != 0:
            return False, result.stderr or result.stdout or f"Exit code {result.returncode}", []
    except subprocess.TimeoutExpired:
        return False, "Analysis timeout (180s)", []
    except Exception as e:
        return False, str(e), []

    images = []
    for p in Path(out_dir).rglob("*.png"):
        if p.is_file():
            images.append(str(p))
    return True, "", images


def _images_to_base64(paths: list[str]) -> list[str]:
    out = []
    for p in paths:
        try:
            with open(p, "rb") as f:
                out.append(f"data:image/png;base64,{base64.b64encode(f.read()).decode()}")
        except Exception:
            pass
    return out


@app.get("/health")
async def health():
    return {"status": "ok", "service": "neorual-nematode"}


@app.post("/analyze/vit")
async def analyze_vit(file: UploadFile = File(...)):
    """ViT 神经元形态分类（arborization/bend/break）"""
    if not file.filename or not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(400, "Image file required (PNG/JPEG/WebP)")
    with tempfile.TemporaryDirectory() as tmp:
        img_path = os.path.join(tmp, "input.png")
        with open(img_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)
        success, err, img_paths = _run_script(
            "inference_vit_classification.py", img_path, out_dir, ["--no-gradcam"]
        )
        if not success:
            return {"success": False, "error": err, "images": []}
        result_path = next((p for p in img_paths if "vit_classification_result" in p), img_paths[0] if img_paths else None)
        images = _images_to_base64([result_path] if result_path else img_paths)
        summary = "## ViT 神经元形态分类结果\n\n### 十项评价指标（本步输出）\n| 指标 | 值 |\n|------|-----|\n"
        results_json = Path(out_dir) / "results.json"
        if results_json.exists():
            import json
            with open(results_json, "r", encoding="utf-8") as f:
                results = json.load(f)
            task_names = {"arborization": "增生", "bend": "异常弯曲", "break": "断裂"}
            for task, r in results.items():
                name = task_names.get(task, task)
                p0, p1 = f"{r['probs'][0]*100:.1f}", f"{r['probs'][1]*100:.1f}"
                summary += f"| {name} | {r['label']}（类别0={p0}% / 类别1={p1}%） |\n"
            summary += "\n左图：输入图像；右图：三任务概率柱状图。"
        else:
            summary += "| 断裂 | — |\n| 增生 | — |\n| 异常弯曲 | — |\n"
            summary += "\n树突分支、弯曲、断裂三任务分类已完成。"
        return {"success": True, "summary": summary, "images": images}


@app.post("/analyze/bead")
async def analyze_bead(file: UploadFile = File(...)):
    """串珠分割"""
    if not file.filename or not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(400, "Image file required (PNG/JPEG/WebP)")
    with tempfile.TemporaryDirectory() as tmp:
        img_path = os.path.join(tmp, "input.png")
        with open(img_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)
        success, err, img_paths = _run_script("visualize_bead_segmentation.py", img_path, out_dir)
        if not success:
            return {"success": False, "error": err, "images": []}
        result_path = next((p for p in img_paths if "bead_segmentation_result" in p), img_paths[0] if img_paths else None)
        images = _images_to_base64([result_path] if result_path else img_paths)
        summary = "## 串珠分割结果\n\n### 十项评价指标（本步输出）\n| 指标 | 值 |\n|------|-----|\n"
        metrics_path = Path(out_dir) / "metrics.json"
        if metrics_path.exists():
            import json
            with open(metrics_path, "r", encoding="utf-8") as f:
                metrics = json.load(f)
            summary += f"| 串珠数量 | {metrics.get('串珠数量', '—')} |\n| 平均串珠大小 | {metrics.get('平均串珠大小', '—')} px² |\n"
        else:
            summary += "| 串珠数量 | — |\n| 平均串珠大小 | — |\n"
        summary += "\n灰度背景叠加红色区域为检测到的串珠结构。"
        return {"success": True, "summary": summary, "images": images}


@app.post("/analyze/cellbody")
async def analyze_cellbody(file: UploadFile = File(...)):
    """细胞体实例分割"""
    if not file.filename or not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(400, "Image file required (PNG/JPEG/WebP)")
    with tempfile.TemporaryDirectory() as tmp:
        img_path = os.path.join(tmp, "input.png")
        with open(img_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)
        success, err, img_paths = _run_script("visualize_Cellbody_instance_segmentation.py", img_path, out_dir)
        if not success:
            return {"success": False, "error": err, "images": []}
        vis_dir = Path(out_dir) / "vis"
        if vis_dir.exists():
            img_paths = [str(p) for p in vis_dir.glob("*.png")]
        else:
            img_paths = [str(p) for p in Path(out_dir).rglob("*.png") if p.name != "preprocessed_input.png"]
        images = _images_to_base64(img_paths[:10])
        summary = "## 细胞体实例分割结果\n\n### 十项评价指标（本步输出）\n| 指标 | 值 |\n|------|-----|\n"
        metrics_path = Path(out_dir) / "metrics.json"
        if metrics_path.exists():
            import json
            with open(metrics_path, "r", encoding="utf-8") as f:
                metrics = json.load(f)
            summary += f"| CEP数量 | {metrics.get('CEP数量', '—')} |\n| 平均CEP大小 | {metrics.get('平均CEP大小', '—')} px² |\n| ADE数量 | {metrics.get('ADE数量', '—')} |\n| 平均ADE大小 | {metrics.get('平均ADE大小', '—')} px² |\n"
        else:
            summary += "| CEP数量 | — |\n| 平均CEP大小 | — |\n| ADE数量 | — |\n| 平均ADE大小 | — |\n"
        summary += "\n每个检测到的细胞体已标注。"
        return {"success": True, "summary": summary, "images": images}


@app.post("/analyze/dendrite")
async def analyze_dendrite(file: UploadFile = File(...)):
    """树突检测（Faster R-CNN）"""
    if not file.filename or not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(400, "Image file required (PNG/JPEG/WebP)")
    with tempfile.TemporaryDirectory() as tmp:
        img_path = os.path.join(tmp, "input.png")
        with open(img_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)
        success, err, img_paths = _run_script("visualize_Dendrite_detection.py", img_path, out_dir)
        if not success:
            return {"success": False, "error": err, "images": []}
        vis_dir = Path(out_dir) / "vis"
        if vis_dir.exists():
            img_paths = [str(p) for p in vis_dir.glob("*.png")]
        else:
            img_paths = [str(p) for p in Path(out_dir).rglob("*.png") if p.name != "preprocessed_input.png"]
        images = _images_to_base64(img_paths[:10])
        summary = "## 树突检测结果\n\n### 十项评价指标（本步输出）\n| 指标 | 值 |\n|------|-----|\n"
        metrics_path = Path(out_dir) / "metrics.json"
        if metrics_path.exists():
            import json
            with open(metrics_path, "r", encoding="utf-8") as f:
                metrics = json.load(f)
            summary += f"| 树突长度 | {metrics.get('树突长度', '—')} px |\n"
        else:
            summary += "| 树突长度 | — |\n"
        summary += "\n每个检测到的树突已用边界框标注。"
        return {"success": True, "summary": summary, "images": images}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
