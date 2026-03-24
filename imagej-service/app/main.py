"""
Fiji/ImageJ 线虫图像分析 Web API
基于 subprocess 调用 Fiji headless 模式，支持线虫视频/图像分析。
参照 修改3.4.md 实现：视频使用 wrMTrck (nematode_tracker.py)，图像使用 Analyze Particles (image_analyzer.py)。
"""
import json
import os
import platform
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request

# Starlette 默认 max_part_size=1MB，线虫视频常超 100MB，需放宽限制
MAX_UPLOAD_MB = 1024
MAX_PART_SIZE = MAX_UPLOAD_MB * 1024 * 1024


app = FastAPI(title="ImageJ Nematode Analysis API", version="2.0.0")

# 脚本路径：Docker 中为 /app/scripts，本地为 imagej-service/scripts
_APP_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPT_DIR = os.path.join(_APP_DIR, "scripts")
if not os.path.isdir(SCRIPT_DIR):
    SCRIPT_DIR = os.path.join(_APP_DIR, "..", "scripts")
SCRIPT_DIR = os.path.abspath(SCRIPT_DIR)
NEMATODE_TRACKER_SCRIPT = os.path.join(SCRIPT_DIR, "nematode_tracker.py")
NEMATODE_TRACKER_MACRO = os.path.join(SCRIPT_DIR, "nematode_tracker.ijm")
IMAGE_ANALYZER_MACRO = os.path.join(SCRIPT_DIR, "image_analyzer.ijm")
IMAGE_ANALYZER_SCRIPT = os.path.join(SCRIPT_DIR, "image_analyzer.py")


def _get_fiji_executable() -> str:
    """根据系统返回 Fiji 可执行文件路径"""
    fiji_path = os.environ.get("FIJI_PATH", "/opt/Fiji.app")
    if not os.path.exists(fiji_path):
        raise RuntimeError(f"Fiji not found at {fiji_path}")
    system = platform.system()
    if system == "Windows":
        exe = os.path.join(fiji_path, "ImageJ-win64.exe")
    else:
        exe = os.path.join(fiji_path, "ImageJ-linux64")
    if not os.path.exists(exe):
        exe = os.path.join(fiji_path, "ImageJ")
    if not os.path.exists(exe):
        raise RuntimeError(f"Fiji executable not found in {fiji_path}")
    return exe


def _is_video(filename: str) -> bool:
    ext = (filename or "").lower().split(".")[-1]
    return ext in ("mp4", "avi", "mov", "tif", "tiff", "zip")


def _run_fiji_headless(script_path: str, *args: str) -> subprocess.CompletedProcess:
    """
    以 headless 模式运行 Fiji 脚本。
    参照 修改3.4.md：--headless --console -batch <script> <args...>
    """
    fiji_exe = _get_fiji_executable()
    if not os.path.exists(script_path):
        raise FileNotFoundError(f"Script not found: {script_path}")
    base_cmd = [fiji_exe, "--headless", "--console", "-batch", script_path] + list(args)
    return _run_fiji_command(base_cmd)


def _run_fiji_macro(macro_path: str, arg_string: str) -> subprocess.CompletedProcess:
    """
    以 -macro 模式运行 ImageJ 宏。
    Linux 下使用 xvfb-run 提供虚拟显示，解决 wrMTrck "Cannot instantiate headless dialog" 错误。
    """
    fiji_exe = _get_fiji_executable()
    if not os.path.exists(macro_path):
        raise FileNotFoundError(f"Macro not found: {macro_path}")
    base_cmd = [fiji_exe, "--headless", "--console", "-macro", macro_path, arg_string]
    return _run_fiji_command(base_cmd)


def _run_fiji_command(base_cmd: list) -> subprocess.CompletedProcess:
    """
    运行 Fiji 命令。Linux 下用 xvfb-run 包装以提供虚拟显示。
    """
    if platform.system() != "Windows" and shutil.which("xvfb-run"):
        command = ["xvfb-run", "-a"] + base_cmd
    else:
        command = base_cmd
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=600,
    )


def _parse_wrmtrck_output(txt_path: str) -> Dict[str, Any]:
    """
    解析 wrMTrck 生成的 txt 文件，提取 Body Bends、Path Length 等指标。
    wrMTrck 输出通常为制表符分隔，首行为列名。
    """
    result: Dict[str, Any] = {"path": txt_path, "rows": 0, "summary": {}}
    if not os.path.exists(txt_path):
        return result
    try:
        with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = [l.strip() for l in f.readlines() if l.strip()]
        if not lines:
            return result
        headers = lines[0].split("\t")
        data_rows = []
        for line in lines[1:]:
            parts = line.split("\t")
            if len(parts) >= len(headers):
                row = dict(zip(headers, parts[: len(headers)]))
                data_rows.append(row)
        result["rows"] = len(data_rows)
        if data_rows:
            # 尝试提取常见列：Body Bends, Path Length, Track ID 等
            numeric_cols = []
            for col in ["Body Bends", "Path Length", "Track ID", "Area", "Perimeter"]:
                if col in headers:
                    try:
                        vals = [float(row.get(col, 0)) for row in data_rows if row.get(col)]
                        if vals:
                            result["summary"][col] = {
                                "mean": sum(vals) / len(vals),
                                "min": min(vals),
                                "max": max(vals),
                                "count": len(vals),
                            }
                    except (ValueError, TypeError):
                        pass
    except Exception as e:
        result["parse_error"] = str(e)
    return result


def _run_video_analysis(
    video_path: str,
    work_dir: str,
) -> Dict[str, Any]:
    """
    运行 nematode_tracker.ijm 宏对视频进行 wrMTrck 分析。
    使用 -macro 模式可避免 headless 下 "Cannot instantiate headless dialog" 错误。
    视频需放在 work_dir 中，宏会遍历该目录处理所有支持的视频格式。
    """
    work_dir_abs = os.path.abspath(work_dir)
    arg_string = "dir=" + work_dir_abs.replace("\\", "/")
    if os.path.exists(NEMATODE_TRACKER_MACRO):
        proc = _run_fiji_macro(NEMATODE_TRACKER_MACRO, arg_string)
    else:
        proc = _run_fiji_headless(NEMATODE_TRACKER_SCRIPT, work_dir_abs)
    analysis_data: Dict[str, Any] = {
        "status": "success" if proc.returncode == 0 else "partial",
        "filename": os.path.basename(video_path),
        "count": 0,
        "details": {
            "analysis_type": "movement",
            "method": "wrMTrck_headless",
            "fiji_stdout": proc.stdout[-2000:] if proc.stdout else "",
            "fiji_stderr": proc.stderr[-1000:] if proc.stderr else "",
        },
    }
    # 解析生成的 txt 文件
    base_path = video_path
    for ext in [".avi", ".mp4", ".mov", ".tif", ".tiff", ".zip"]:
        if video_path.lower().endswith(ext):
            base_path = video_path[: -len(ext)]
            break
    bend2_path = base_path + "_bendthreshold2.txt"
    bend3_path = base_path + "_bendthreshold3.txt"
    parsed_2 = _parse_wrmtrck_output(bend2_path)
    parsed_3 = _parse_wrmtrck_output(bend3_path)
    analysis_data["details"]["bendthreshold2"] = parsed_2
    analysis_data["details"]["bendthreshold3"] = parsed_3
    # 读取原始 .txt 内容，供 Manus 写入分析结果并上传 MinIO
    for key, p in [("bendthreshold2_content", bend2_path), ("bendthreshold3_content", bend3_path)]:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    analysis_data["details"][key] = f.read()
            except Exception:
                pass
    # 使用 bendthreshold2 的 rows 作为追踪数量
    analysis_data["count"] = parsed_2.get("rows", 0) or parsed_3.get("rows", 0)
    if proc.returncode != 0 and not analysis_data["count"]:
        analysis_data["status"] = "partial"
        analysis_data["details"]["fiji_exit_code"] = proc.returncode
    return analysis_data


def _run_image_analysis(
    image_path: str,
    output_path: str,
    rolling_radius: int = 50,
) -> Dict[str, Any]:
    """运行 image_analyzer.ijm 宏对单张图像进行 Analyze Particles 分析（-macro 模式避免 headless 弹窗）"""
    # 使用正斜杠避免 Windows 路径中反斜杠转义问题
    img = image_path.replace("\\", "/")
    out = output_path.replace("\\", "/")
    arg_string = f"{img}|||{out}|||{rolling_radius}"
    proc = _run_fiji_macro(IMAGE_ANALYZER_MACRO, arg_string)
    if not os.path.exists(output_path):
        return {
            "status": "partial",
            "filename": os.path.basename(image_path),
            "count": 0,
            "details": {
                "error": "No output file generated",
                "fiji_stdout": proc.stdout[-1000:] if proc.stdout else "",
                "fiji_stderr": proc.stderr[-1000:] if proc.stderr else "",
            },
        }
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "status": data.get("status", "success"),
            "filename": data.get("filename", os.path.basename(image_path)),
            "dimensions": data.get("dimensions", []),
            "count": data.get("count", 0),
            "details": {
                "analysis_type": "morphology",
                "method": "AnalyzeParticles_headless",
            },
        }
    except Exception as e:
        return {
            "status": "partial",
            "filename": os.path.basename(image_path),
            "count": 0,
            "details": {"parse_error": str(e)},
        }


@app.get("/health")
async def health():
    """健康检查"""
    try:
        _get_fiji_executable()
        return {"status": "ok", "service": "imagej-nematode", "mode": "headless"}
    except Exception as e:
        return {"status": "error", "service": "imagej-nematode", "error": str(e)}


@app.post("/analyze/nematode")
async def analyze_nematode(request: Request):
    """
    分析线虫图像/视频。
    支持通过 options JSON 指定：analysis_type, subtract_background, rolling_radius, run_tracking
    视频：使用 Fiji headless + nematode_tracker.py (wrMTrck)
    图像：使用 Fiji headless + image_analyzer.py (Analyze Particles)
    使用 max_part_size=200MB 以支持大视频上传（Starlette 默认仅 1MB）
    """
    form = await request.form(max_part_size=MAX_PART_SIZE)
    file = form.get("file")
    if not file or not hasattr(file, "file"):
        raise HTTPException(status_code=400, detail="Missing 'file' in form data")
    options_str = form.get("options")
    opts: dict = {}
    if options_str and isinstance(options_str, str):
        try:
            opts = json.loads(options_str)
        except json.JSONDecodeError:
            pass

    analysis_type = opts.get("analysis_type", "auto")
    rolling_radius = int(opts.get("rolling_radius", 50))
    run_tracking = opts.get("run_tracking")

    is_video = _is_video(file.filename or "")

    if analysis_type == "movement":
        run_tracking = True
    elif analysis_type in ("fluorescence", "morphology", "preprocessing"):
        run_tracking = False
    else:
        run_tracking = is_video if run_tracking is None else run_tracking

    try:
        if is_video and run_tracking:
            # 视频：保存到临时目录，运行 nematode_tracker.py
            with tempfile.TemporaryDirectory() as work_dir:
                temp_path = os.path.join(work_dir, file.filename or "video.avi")
                with open(temp_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                analysis_data = _run_video_analysis(temp_path, work_dir)
        else:
            # 图像：保存到临时文件，运行 image_analyzer.py
            with tempfile.NamedTemporaryFile(
                suffix=os.path.splitext(file.filename or "image.png")[1],
                delete=False,
            ) as tmp:
                shutil.copyfileobj(file.file, tmp)
                temp_path = tmp.name
            try:
                output_path = temp_path + "_result.json"
                # RGBA/多通道图预处理
                dims: List[int] = []
                try:
                    from PIL import Image

                    with Image.open(temp_path) as img:
                        img.load()
                        dims = [img.width, img.height]
                        if hasattr(img, "n_frames") and img.n_frames > 1:
                            dims.append(img.n_frames)
                        if img.mode == "RGBA":
                            bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
                            gray = Image.alpha_composite(bg, img).convert("L")
                            gray.save(temp_path, format="PNG")
                        elif img.mode in ("LA", "CMYK", "RGB"):
                            img.convert("L").save(temp_path, format="PNG")
                except Exception:
                    pass
                analysis_data = _run_image_analysis(
                    temp_path, output_path, rolling_radius
                )
                if dims and "dimensions" not in analysis_data:
                    analysis_data["dimensions"] = dims
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                if os.path.exists(temp_path + "_result.json"):
                    os.remove(temp_path + "_result.json")

        return analysis_data

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="Fiji 分析超时（600秒），请尝试较小的文件",
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
