#!/usr/bin/env python3
"""
C. elegans RAG Data Preprocessor
Converts raw CSV/TSV data and curated knowledge into chunked documents
with metadata for vector embedding.
"""

import csv
import json
import os
import re
import hashlib

RAW_DIR = os.path.join(os.path.dirname(__file__), "data", "raw")
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "data", "processed")

CHUNK_SIZE = 800  # target characters per chunk
CHUNK_OVERLAP = 100  # overlap characters


def ensure_dirs():
    os.makedirs(PROCESSED_DIR, exist_ok=True)


def chunk_id(text: str) -> str:
    return hashlib.md5(text[:200].encode()).hexdigest()[:12]


def split_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks at sentence boundaries."""
    if len(text) <= chunk_size:
        return [text.strip()] if text.strip() else []
    
    sentences = re.split(r'(?<=[.。!?！？\n])\s*', text)
    chunks = []
    current = ""
    
    for sent in sentences:
        if not sent.strip():
            continue
        if len(current) + len(sent) > chunk_size and current:
            chunks.append(current.strip())
            # Keep overlap
            words = current.split()
            overlap_text = " ".join(words[-20:]) if len(words) > 20 else current[-overlap:]
            current = overlap_text + " " + sent
        else:
            current = (current + " " + sent).strip()
    
    if current.strip():
        chunks.append(current.strip())
    
    return chunks


def process_neurons():
    """Process neurons.csv: neuron name, type, lineage."""
    path = os.path.join(RAW_DIR, "neurons.csv")
    if not os.path.exists(path):
        return []
    
    docs = []
    neurons_by_type = {}
    
    with open(path, "r") as f:
        for line in f:
            parts = line.strip().split(";")
            if len(parts) >= 3:
                name, ntype, lineage = parts[0], parts[1], parts[2]
                if ntype not in neurons_by_type:
                    neurons_by_type[ntype] = []
                neurons_by_type[ntype].append((name, lineage))
    
    # Create grouped documents by neuron type
    for ntype, neurons in neurons_by_type.items():
        neuron_list = ", ".join([f"{n[0]} (lineage: {n[1]})" for n in neurons])
        text = f"# C. elegans {ntype}s\n\n"
        text += f"The following C. elegans neurons are classified as {ntype}s:\n\n"
        text += neuron_list
        text += f"\n\nTotal count: {len(neurons)} neurons of type '{ntype}'."
        
        for chunk in split_text(text):
            docs.append({
                "id": chunk_id(chunk),
                "text": chunk,
                "metadata": {
                    "source": "OpenWormData/neurons.csv",
                    "origin": "WormAtlas",
                    "category": "neuron_types",
                    "neuron_type": ntype,
                }
            })
    
    return docs


def process_cell_descriptions():
    """Process cell_descriptions_wormatlas.tsv: cell name, lineage, description."""
    path = os.path.join(RAW_DIR, "cell_descriptions_wormatlas.tsv")
    if not os.path.exists(path):
        return []
    
    docs = []
    with open(path, "r") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader, None)
        
        for row in reader:
            if len(row) >= 3:
                cell, lineage, desc = row[0], row[1], row[2]
                if not desc or desc.strip() == "":
                    continue
                text = f"# Cell: {cell}\n\nLineage: {lineage}\n\nDescription: {desc}"
                
                for chunk in split_text(text):
                    docs.append({
                        "id": chunk_id(chunk),
                        "text": chunk,
                        "metadata": {
                            "source": "OpenWormData/cell_descriptions_wormatlas.tsv",
                            "origin": "WormAtlas",
                            "category": "cell_description",
                            "cell_name": cell,
                        }
                    })
    
    return docs


def process_neurotransmitters():
    """Process neurotransmitters.csv: entity relationships."""
    path = os.path.join(RAW_DIR, "neurotransmitters.csv")
    if not os.path.exists(path):
        return []
    
    docs = []
    grouped = {}
    
    with open(path, "r") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        
        for row in reader:
            if len(row) >= 3:
                entity, rel, target = row[0], row[1], row[2]
                evidence = row[3] if len(row) > 3 else ""
                url = row[4] if len(row) > 4 else ""
                
                key = entity
                if key not in grouped:
                    grouped[key] = []
                grouped[key].append({
                    "relationship": rel,
                    "target": target,
                    "evidence": evidence,
                    "url": url,
                })
    
    # Group by neuron and create documents
    for neuron, rels in grouped.items():
        lines = [f"# Neuron {neuron} - Neurotransmitter Profile\n"]
        for r in rels:
            lines.append(f"- {r['relationship']}: {r['target']} (Source: {r['evidence']})")
        
        text = "\n".join(lines)
        for chunk in split_text(text):
            docs.append({
                "id": chunk_id(chunk),
                "text": chunk,
                "metadata": {
                    "source": "OpenWormData/neurotransmitters.csv",
                    "origin": "WormAtlas",
                    "category": "neurotransmitter",
                    "neuron": neuron,
                }
            })
    
    return docs


def process_connectome():
    """Process connectome.csv: neural connections."""
    path = os.path.join(RAW_DIR, "connectome.csv")
    if not os.path.exists(path):
        return []
    
    docs = []
    connections_by_source = {}
    
    with open(path, "r") as f:
        for line in f:
            parts = line.strip().split(";")
            if len(parts) >= 4:
                target, source, conn_type, weight = parts[0], parts[1], parts[2], parts[3]
                nt = parts[4] if len(parts) > 4 else ""
                
                if source not in connections_by_source:
                    connections_by_source[source] = []
                connections_by_source[source].append({
                    "target": target,
                    "type": conn_type,
                    "weight": weight,
                    "neurotransmitter": nt,
                })
    
    for neuron, conns in connections_by_source.items():
        sends = [c for c in conns if c["type"] == "Send"]
        gaps = [c for c in conns if c["type"] == "GapJunction"]
        
        text = f"# Connectome: Neuron {neuron}\n\n"
        if sends:
            text += f"Chemical synapses (sends to): "
            text += ", ".join([f"{c['target']} (weight:{c['weight']}, NT:{c['neurotransmitter']})" for c in sends[:20]])
            text += f"\nTotal chemical synapses: {len(sends)}\n\n"
        if gaps:
            text += f"Gap junctions: "
            text += ", ".join([f"{c['target']} (weight:{c['weight']})" for c in gaps[:20]])
            text += f"\nTotal gap junctions: {len(gaps)}\n"
        
        for chunk in split_text(text):
            docs.append({
                "id": chunk_id(chunk),
                "text": chunk,
                "metadata": {
                    "source": "OpenWormData/connectome.csv",
                    "origin": "OpenWorm",
                    "category": "connectome",
                    "neuron": neuron,
                }
            })
    
    return docs


def process_ion_channels():
    """Process ion_channel.csv."""
    path = os.path.join(RAW_DIR, "ion_channel.csv")
    if not os.path.exists(path):
        return []
    
    docs = []
    with open(path, "r") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        
        channels = []
        for row in reader:
            if row:
                channels.append(row)
    
    if channels:
        text = "# C. elegans Ion Channels\n\n"
        text += "Ion channels play crucial roles in neural signaling in C. elegans.\n\n"
        for ch in channels:
            text += f"- {', '.join(ch)}\n"
        
        for chunk in split_text(text):
            docs.append({
                "id": chunk_id(chunk),
                "text": chunk,
                "metadata": {
                    "source": "OpenWormData/ion_channel.csv",
                    "origin": "WormBase",
                    "category": "ion_channel",
                }
            })
    
    return docs


def create_curated_knowledge():
    """Create curated knowledge documents from expert-level content about
    C. elegans neurotoxicity testing protocols and experimental methods."""
    
    docs = []
    
    # Neurotoxicity testing protocols
    protocols = [
        {
            "title": "C. elegans 神经毒性检测实验总体方案",
            "text": """# C. elegans 神经毒性检测实验总体方案

## 概述
秀丽隐杆线虫（C. elegans）是神经毒性评估的理想模式生物。其具有302个神经元（雌雄同体），身体透明，生命周期短（约3天从卵到成虫），基因组已完全测序，且约60-80%的基因与人类同源。

## 实验设计原则
1. 使用N2野生型品系作为基础实验对象
2. 使用BZ555品系（dat-1p::GFP）评估多巴胺能神经元
3. 使用LX929品系（unc-17::GFP）评估胆碱能神经元
4. 设置对照组（未处理）和多个浓度梯度的处理组
5. 每组至少20条线虫，重复3次独立实验

## 标准7天实验流程
- 第1天：药物暴露准备和开始暴露
  - 准备NGM培养基平板
  - 配制检测物质溶液（按实验设计浓度梯度）
  - 通过次氯酸钠处理获取同步化L1期线虫
  - 将线虫转移到含药物的培养基上开始暴露
  - 记录初始状态和线虫数量

- 第2-6天：观察和维持
  - 每日观察线虫状态（运动、形态、存活）
  - 检查培养基湿度和食物（E. coli OP50）
  - 记录异常情况（运动障碍、形态变化、死亡）
  - 必要时转移线虫到新鲜培养基

- 第7天：行为学测试和拍照记录
  - 进行1-Nonanol嗅觉回避实验（评估多巴胺水平）
  - 进行Aldicarb麻痹实验（评估乙酰胆碱传递）
  - 进行Levamisole实验（评估烟碱型乙酰胆碱受体活性）
  - 荧光显微镜下观察和拍照（使用GFP标记品系）
  - 统计线虫存活率
  - 评估神经元形态学变化
  - 收集数据并进行统计分析""",
            "metadata": {
                "source": "curated_protocol",
                "origin": "Expert Knowledge + PMC8966687",
                "category": "protocol",
                "protocol_type": "neurotoxicity_overview",
            }
        },
        {
            "title": "NGM培养基制备方法",
            "text": """# NGM（Nematode Growth Medium）培养基制备方法

## 材料
- 氯化钠（NaCl）: 50 mM
- 蛋白胨（Peptone）: 2.5 g/L
- 琼脂（Agar）: 17 g/L
- 胆固醇溶液: 5 mg/ml（乙醇配制），1 ml
- 氯化钙（CaCl2）: 1 mM（灭菌后添加）
- 硫酸镁（MgSO4）: 1 mM（灭菌后添加）
- 磷酸二氢钾（KH2PO4）: 25 mM（灭菌后添加）
- 双蒸水: 975 ml

## 制备步骤
1. 将NaCl、蛋白胨和琼脂加入975 ml双蒸水中
2. 高压灭菌（121°C, 15 psi, 40分钟）
3. 冷却至60°C后添加：
   - 1 ml 胆固醇溶液
   - 1 mM CaCl2（已灭菌）
   - 1 mM MgSO4（已灭菌）
   - 25 mM KH2PO4（已灭菌）
4. 混匀后倒入培养皿
5. 待凝固后接种E. coli OP50作为食物源

## 注意事项
- 避免气泡，可用200 µl枪头去除
- 培养基可在4°C保存约1个月
- 含药物的培养基需现用现配""",
            "metadata": {
                "source": "curated_protocol",
                "origin": "WormAtlas + PMC8966687",
                "category": "protocol",
                "protocol_type": "media_preparation",
            }
        },
        {
            "title": "1-Nonanol嗅觉回避实验协议",
            "text": """# 1-Nonanol嗅觉回避实验（评估多巴胺水平）

## 原理
C. elegans对1-nonanol表现出嗅觉回避行为，该行为与多巴胺信号通路密切相关。回避时间延长表示多巴胺水平降低，反之亦然。cat-2（酪氨酸羟化酶）突变会降低回避反应，而dat-1（多巴胺转运体）抑制会增强反应。

## 材料
- 1-Nonanol（Acros Organic, Cat No: AC157471000）
- NGM平板（60 mm或90 mm）
- M9缓冲液
- 探针睫毛（eyelash probe）
- 秒表
- 体视显微镜

## 操作步骤
1. 处理后第2天（48小时）：用M9缓冲液洗涤线虫3-4次
2. 离心（2000 rpm, 3分钟），弃上清
3. 将线虫悬液（100 µl M9中重悬）滴在NGM平板上
4. 待液滴干燥，必要时用探针分开线虫
5. 取20 µl 1-nonanol于离心管盖中
6. 将探针轻蘸1-nonanol，去除多余液体
7. 将探针靠近线虫头部区域（不接触线虫），开始计时
8. 线虫表现出回避行为时停止计时
9. 每个重复测量至少20条线虫

## 评分标准
- 正常回避时间：1.2-2.0秒（野生型未处理）
- 回避行为：180°完全反转或90°弯曲后远离
- 保持标准一致

## 对照
- 阳性对照：Bupropion HCL或UA57品系（cat-2过表达）
- 阴性对照：MT15620品系（cat-2突变体）""",
            "metadata": {
                "source": "curated_protocol",
                "origin": "PMC8966687 (Sammi et al., 2022)",
                "category": "protocol",
                "protocol_type": "behavioral_assay_nonanol",
            }
        },
        {
            "title": "Aldicarb麻痹实验协议",
            "text": """# Aldicarb麻痹实验（评估乙酰胆碱传递）

## 原理
Aldicarb是乙酰胆碱酯酶（AChE）抑制剂，阻断乙酰胆碱的分解，导致突触间隙ACh积累，引起肌肉挛缩和麻痹。麻痹百分比反映ACh水平。

## 材料
- Aldicarb（Sigma, Cat No: 33386-100MG）
- NGM培养基
- M9缓冲液
- 12孔或6孔培养板
- 探针睫毛
- 体视显微镜

## NGM-Aldicarb平板制备
1. 将100 mM Aldicarb储液（乙醇配制）稀释1:200
2. 最终浓度0.5 mM（可在0.5-1 mM间调整）
3. 倒入12孔板（3 ml/孔）或35 mm培养皿（3 ml）
4. 避免气泡，保持体积一致

## 操作步骤
1. 处理后第2天（48小时）：用M9洗涤线虫3-4次
2. 离心（2000 rpm, 3分钟），弃上清
3. 转移约30条线虫到NGM-Aldicarb平板上
4. 待缓冲液干燥，用探针分开线虫
5. 每30分钟计数麻痹线虫数量
6. 用探针轻触确认麻痹（触碰3次不动视为麻痹）

## 评分标准
- 计算麻痹百分比 = 麻痹数/总数 × 100%
- 以对照组50%麻痹时间点为参考
- 麻痹先出现在体肌，头部可能仍有运动
- 保持判断标准一致

## 对照
- 阳性对照：多奈哌齐（Donepezil）、加兰他敏（Galantamine）
- 阴性对照：cha-1, unc-17, unc-13等突变体""",
            "metadata": {
                "source": "curated_protocol",
                "origin": "PMC8966687 (Sammi et al., 2022)",
                "category": "protocol",
                "protocol_type": "behavioral_assay_aldicarb",
            }
        },
        {
            "title": "多巴胺能神经元形态学评估",
            "text": """# 多巴胺能神经元形态学评估协议

## 原理
利用BZ555品系（dat-1p::GFP），在荧光显微镜下可视化多巴胺能神经元。C. elegans雌雄同体有8个多巴胺能神经元：4个CEP（头部感觉神经元）、2个ADE（前触角神经元）、2个PDE（后触角神经元）。

## 材料
- BZ555品系线虫（dat-1p::GFP）
- 叠氮钠（NaN3, 100 mM）用于麻醉
- 载玻片和盖玻片
- 透明指甲油（封片用）
- 荧光显微镜（FITC滤光片，激发/发射：485/520 nm）

## 操作步骤
1. 处理后第3天（72小时）：用M9洗涤线虫3-4次
2. 离心（2000 rpm, 3分钟），弃上清
3. 向100 µl线虫悬液中加入10 µl 100 mM NaN3麻醉
4. 将线虫封片在载玻片上
5. 用透明指甲油密封
6. 在FITC滤光片下观察

## 评分方法
### 方法1：逐个神经元评分（推荐）
- 检查所有8个神经元（4 CEP + 2 ADE + 2 PDE）
- 评估每个神经元的完整性
- 计算完整神经元百分比

### 方法2：整体评分
- 有任何神经元损伤即标记为"受影响"
- 计算无损伤线虫百分比

## 神经退行性变化标志
- 树突断裂（broken dendrites）
- 细胞体缺失或损伤（damaged/missing cell bodies）
- 树突分支异常（branching of soma）
- 树突呈波浪状/串珠状（wavy/beaded dendrites）

## 统计要求
- 每个重复至少评估20条线虫
- 至少3次独立重复实验
- 使用ANOVA + Dunnett事后检验""",
            "metadata": {
                "source": "curated_protocol",
                "origin": "PMC8966687 (Sammi et al., 2022)",
                "category": "protocol",
                "protocol_type": "morphological_assessment_dopaminergic",
            }
        },
        {
            "title": "C. elegans多巴胺能神经元系统",
            "text": """# C. elegans 多巴胺能神经元系统

## 神经元组成
C. elegans雌雄同体具有8个多巴胺能神经元，分为3个亚群：
- **CEP神经元**（4个）：Cephalic sensilla neurons，位于头部，是机械感觉神经元
  - CEPDL（左背侧）、CEPDR（右背侧）
  - CEPVL（左腹侧）、CEPVR（右腹侧）
- **ADE神经元**（2个）：Anterior deirid neurons，前触角神经元
  - ADEL（左侧）、ADER（右侧）
- **PDE神经元**（2个）：Posterior deirid neurons，后触角神经元
  - PDEL（左侧）、PDER（右侧）
  - 注意：PDE是晚期发育神经元

## 关键基因
- **cat-2**：酪氨酸羟化酶（TH），多巴胺合成关键酶
- **dat-1**：多巴胺转运体（DAT），负责突触间隙多巴胺回收
- **bas-1**：芳香族氨基酸脱羧酶（AADC）
- **cat-1**：囊泡单胺转运体（VMAT）
- **cat-4**：GTP环化水解酶I（GCH1）

## 多巴胺功能
- 调节运动行为（basal slowing response）
- 参与嗅觉回避反应（1-nonanol avoidance）
- 调节产卵行为
- 参与学习和记忆

## 与人类疾病的关联
多巴胺能神经元退行性变与帕金森病密切相关。C. elegans的多巴胺信号通路与哺乳动物高度保守，使其成为研究帕金森病机制和筛选神经保护药物的理想模型。

## 常用品系
- BZ555: egIs1[dat-1p::GFP] - 多巴胺能神经元GFP标记
- BY200: vtIs1[dat-1p::GFP; rol-6(su1006)] - 另一种标记品系
- UA57: baIs4[dat-1p::GFP, dat-1p::cat-2] - cat-2过表达
- MT15620: cat-2(n4547) - cat-2突变体""",
            "metadata": {
                "source": "curated_knowledge",
                "origin": "WormAtlas + WormBase + Literature",
                "category": "neuron_system",
                "system": "dopaminergic",
            }
        },
        {
            "title": "C. elegans胆碱能神经元系统",
            "text": """# C. elegans 胆碱能神经元系统

## 概述
C. elegans约有120个胆碱能神经元，是最大的神经递质类群。胆碱能神经元主要参与运动控制和感觉处理。

## 关键基因
- **cha-1/ChAT**：胆碱乙酰转移酶，合成乙酰胆碱
- **unc-17/VAChT**：囊泡乙酰胆碱转运体
- **ace-1, ace-2**：乙酰胆碱酯酶
- **unc-29, unc-38, unc-63**：烟碱型乙酰胆碱受体亚基

## 乙酰胆碱受体类型
### 烟碱型受体（nAChR）
- 配体门控离子通道
- 介导快速突触传递
- Levamisole敏感型和Nicotine敏感型

### 毒蕈碱型受体（mAChR）
- G蛋白偶联受体
- 调节慢速突触传递

## 与人类疾病的关联
胆碱能系统异常与阿尔茨海默病、帕金森病、亨廷顿病和精神分裂症相关。

## 常用品系
- LX929: vsIs48[unc-17::GFP] - 胆碱能神经元GFP标记""",
            "metadata": {
                "source": "curated_knowledge",
                "origin": "WormAtlas + WormBase + Literature",
                "category": "neuron_system",
                "system": "cholinergic",
            }
        },
        {
            "title": "线虫毒性检测常用浓度和暴露方案",
            "text": """# C. elegans 毒性检测常用浓度和暴露方案

## 急性毒性测试
- 暴露时间：24-48小时
- 终点指标：存活率、运动能力
- 常用浓度范围：µM到mM级别（取决于化合物）

## 慢性/亚慢性毒性测试
- 暴露时间：3-7天
- 终点指标：存活率、繁殖能力、发育、行为、神经退行性变
- 常用浓度范围：nM到µM级别

## 神经毒性特异性测试
### 多巴胺能系统
- 1-Nonanol回避实验（48小时暴露后）
- 多巴胺能神经元形态学评估（72小时暴露后）
- 基础减速反应（Basal Slowing Response）

### 胆碱能系统
- Aldicarb麻痹实验（48小时暴露后）
- Levamisole麻痹实验（48小时暴露后）
- 胆碱能神经元形态学评估（72小时暴露后）

## 暴露方式
1. **液体培养**：在K培养基中暴露（适合精确控制浓度）
2. **固体培养基**：将药物混入NGM（适合长期暴露）
3. **食物混合**：将药物与E. coli OP50混合（模拟口服暴露）

## 同步化方法
- 次氯酸钠处理获取胚胎
- 在M9缓冲液中15°C过夜孵化获得L1同步化群体
- 可在L1或L4期开始暴露

## 统计要求
- 每组至少20条线虫
- 至少3次独立重复
- 使用ANOVA + Dunnett事后检验（与对照比较）
- 使用Two-way ANOVA + Sidak检验（多因素比较）""",
            "metadata": {
                "source": "curated_knowledge",
                "origin": "PMC8966687 + Literature Review",
                "category": "protocol",
                "protocol_type": "exposure_design",
            }
        },
        {
            "title": "水样神经毒性检测方案",
            "text": """# 水样神经毒性检测方案（C. elegans模型）

## 适用范围
适用于饮用水、环境水样、工业废水等水体中潜在神经毒性物质的检测和评估。

## 样品前处理
1. 水样采集后4°C保存，24小时内处理
2. 过滤去除颗粒物（0.45 µm滤膜）
3. 根据需要进行浓缩处理
4. 调节pH至6.5-7.5（线虫适宜范围）
5. 设置多个稀释梯度（如原液、1:2、1:5、1:10）

## 7天实验方案
### 第1天：药物暴露
- 准备NGM培养基平板
- 将处理后的水样按设计浓度加入液体培养基
- 获取同步化L1期N2野生型线虫
- 同时准备BZ555（多巴胺能标记）和LX929（胆碱能标记）品系
- 将线虫转移到含水样的培养基中
- 记录初始线虫数量和状态
- 设置阳性对照（如已知神经毒物6-OHDA）和阴性对照（M9缓冲液）

### 第2-6天：观察和维持
- 每日在体视显微镜下观察线虫
- 记录运动行为变化（速度、方向改变频率）
- 记录形态变化（体长、体宽）
- 统计存活数量
- 检查培养基状态，必要时补充食物
- 记录任何异常现象

### 第7天：行为学测试和拍照
- 1-Nonanol嗅觉回避实验（N2品系，评估多巴胺功能）
- Aldicarb麻痹实验（N2品系，评估胆碱能传递）
- 荧光显微镜观察BZ555品系（多巴胺能神经元形态）
- 荧光显微镜观察LX929品系（胆碱能神经元形态）
- 拍照记录神经元形态
- 统计最终存活率
- 数据收集和统计分析

## 判定标准
- 存活率显著降低（p < 0.05）提示急性毒性
- 1-Nonanol回避时间显著延长提示多巴胺能毒性
- Aldicarb麻痹率显著改变提示胆碱能毒性
- 神经元形态学损伤提示神经退行性毒性""",
            "metadata": {
                "source": "curated_protocol",
                "origin": "Expert Knowledge",
                "category": "protocol",
                "protocol_type": "water_sample_testing",
            }
        },
    ]
    
    for proto in protocols:
        for chunk in split_text(proto["text"]):
            doc = {
                "id": chunk_id(chunk),
                "text": chunk,
                "metadata": proto["metadata"].copy(),
            }
            docs.append(doc)
    
    return docs


def main():
    ensure_dirs()
    
    all_docs = []
    
    print("Processing neurons data...")
    all_docs.extend(process_neurons())
    
    print("Processing cell descriptions...")
    all_docs.extend(process_cell_descriptions())
    
    print("Processing neurotransmitters...")
    all_docs.extend(process_neurotransmitters())
    
    print("Processing connectome...")
    all_docs.extend(process_connectome())
    
    print("Processing ion channels...")
    all_docs.extend(process_ion_channels())
    
    print("Creating curated knowledge...")
    all_docs.extend(create_curated_knowledge())
    
    # Save all documents
    output_path = os.path.join(PROCESSED_DIR, "chunks.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_docs, f, ensure_ascii=False, indent=2)
    
    print(f"\nTotal documents: {len(all_docs)}")
    
    # Print category statistics
    categories = {}
    for doc in all_docs:
        cat = doc["metadata"].get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
    
    print("\nCategory breakdown:")
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count}")
    
    print(f"\nOutput saved to: {output_path}")


if __name__ == "__main__":
    main()
