"""
检测框重叠补救机制：若两框重叠>90% 且大小差异≤10%，保留置信度更高的框。
供细胞体实例分割、树突检测等工具使用。
"""


def _bbox_iou(bbox1: list, bbox2: list) -> float:
    """计算两框 IoU (Intersection over Union)。bbox 格式 [x1, y1, x2, y2]。"""
    x1 = max(bbox1[0], bbox2[0])
    y1 = max(bbox1[1], bbox2[1])
    x2 = min(bbox1[2], bbox2[2])
    y2 = min(bbox1[3], bbox2[3])
    inter_w = max(0, x2 - x1)
    inter_h = max(0, y2 - y1)
    inter = inter_w * inter_h
    a1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])
    a2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0 else 0.0


def _size_diff_ratio(area1: float, area2: float) -> float:
    """两框面积差异比，返回 [0, 1]，0 表示完全相同。"""
    if area1 <= 0 and area2 <= 0:
        return 0.0
    mx = max(area1, area2)
    if mx <= 0:
        return 0.0
    return abs(area1 - area2) / mx


def filter_overlapping_boxes(
    items: list,
    *,
    iou_threshold: float = 0.9,
    size_diff_threshold: float = 0.1,
) -> list:
    """
    过滤重叠框：若两框 IoU > iou_threshold 且面积差异 ≤ size_diff_threshold，保留置信度更高的框。

    items: [(bbox, area, score), ...]，bbox 为 [x1, y1, x2, y2]
    返回过滤后的列表，按 score 降序。
    """
    if not items:
        return []
    # 按置信度降序
    sorted_items = sorted(items, key=lambda x: x[2], reverse=True)
    kept = []
    for bbox, area, score in sorted_items:
        if len(bbox) < 4:
            continue
        duplicate = False
        for (kb, ka, _) in kept:
            iou = _bbox_iou(bbox, kb)
            size_diff = _size_diff_ratio(area, ka)
            if iou > iou_threshold and size_diff <= size_diff_threshold:
                duplicate = True
                break
        if not duplicate:
            kept.append((bbox, area, score))
    return kept


def filter_overlapping_boxes_by_area(
    items: list,
    *,
    iou_threshold: float = 0.9,
    size_diff_threshold: float = 0.1,
) -> list:
    """
    无置信度时的重叠过滤：若两框 IoU > iou_threshold 且面积差异 ≤ size_diff_threshold，
    保留面积更大的框（面积大视为更可靠）。

    items: [(bbox, area), ...]，bbox 为 [x1, y1, x2, y2]
    返回过滤后的列表。
    """
    if not items:
        return []
    # 按面积降序（面积大优先保留）
    sorted_items = sorted(items, key=lambda x: x[1], reverse=True)
    kept = []
    for bbox, area in sorted_items:
        if len(bbox) < 4:
            continue
        duplicate = False
        for (kb, ka) in kept:
            iou = _bbox_iou(bbox, kb)
            size_diff = _size_diff_ratio(area, ka)
            if iou > iou_threshold and size_diff <= size_diff_threshold:
                duplicate = True
                break
        if not duplicate:
            kept.append((bbox, area))
    return kept
