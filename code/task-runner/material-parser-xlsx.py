"""Offline XLSX extraction. Never execute formulas, macros or external links.
All workbook sheets, including hidden sheets, are inspected in workbook order.
Stored formula text and cached values are retained without assuming freshness.
Drawings/charts/comments/external links/unsupported cell encodings are reported.
"""
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
MAX_BYTES = 100 * 1024 * 1024
MAX_CELLS = 200000

def parse(path):
    units, blocks, issues = [], [], []
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if len(infos) > 10000 or sum(i.file_size for i in infos) > MAX_BYTES:
            raise ValueError('XLSX 解压总量超限，未截取解析')
        if len(set(i.filename for i in infos)) != len(infos):
            raise ValueError('XLSX 包含重复路径，无法可靠解析')
        names = set(archive.namelist())
        def xml(name):
            data = archive.read(name)
            if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
                raise ValueError('XLSX XML 不允许外部实体或文档类型声明')
            return ET.fromstring(data)
        book = xml('xl/workbook.xml')
        rels = {r.attrib['Id']: r.attrib for r in xml('xl/_rels/workbook.xml.rels')}
        strings = []
        if 'xl/sharedStrings.xml' in names:
            strings = [''.join(t.text or '' for t in si.findall('.//s:t', NS)) for si in xml('xl/sharedStrings.xml').findall('s:si', NS)]
        formats = [0]
        if 'xl/styles.xml' in names:
            formats = [int(x.attrib.get('numFmtId', '0')) for x in xml('xl/styles.xml').findall('s:cellXfs/s:xf', NS)]
        sheets = book.findall('s:sheets/s:sheet', NS)
        if not sheets or len(sheets) > 1000:
            raise ValueError('XLSX 无工作表或工作表数超限')
        cell_count = 0
        for index, sheet in enumerate(sheets, 1):
            uid = 'sheet-' + str(index)
            name = sheet.attrib.get('name', '')
            unit = {'unitId': uid, 'kind': 'SHEET', 'index': index, 'name': name, 'status': 'COMPLETE'}
            units.append(unit)
            try:
                relation = rels[sheet.attrib['{' + REL + '}id']]
                if relation.get('TargetMode') == 'External':
                    raise ValueError('外部工作表不可作为本文件内容')
                target = relation['Target']
                sheet_path = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
                if not sheet_path.startswith('xl/') or '..' in sheet_path.split('/'):
                    raise ValueError('工作表路径越界')
                root = xml(sheet_path)
                if root.tag.split('}')[-1] != 'worksheet':
                    raise ValueError('非单元格工作表需要图形解析')
                seen = set()
                for cell in root.findall('s:sheetData/s:row/s:c', NS):
                    cell_count += 1
                    if cell_count > MAX_CELLS:
                        raise ValueError('单元格数量超限，不能认定完整')
                    address = cell.attrib.get('r', '')
                    if not re.fullmatch(r'[A-Z]+[1-9][0-9]*', address) or address in seen:
                        raise ValueError('单元格位置无效或重复')
                    seen.add(address)
                    cell_type = cell.attrib.get('t', 'n')
                    style = int(cell.attrib.get('s', '0'))
                    if style >= len(formats) or style < 0 or formats[style] not in (0, 1, 2, 3, 4, 11, 48, 49):
                        issues.append(name + '!' + address + ' 数字显示格式含义未保留；百分比、分数、日期或自定义格式待核实')
                        unit['status'] = 'UNREADABLE'
                    value = cell.find('s:v', NS)
                    raw = value.text if value is not None else None
                    formula = cell.find('s:f', NS)
                    formula_text = formula.text if formula is not None and formula.text else None
                    if formula is not None and (not formula_text or raw is None):
                        issues.append(name + '!' + address + ' 公式正文或缓存值未取得；未执行公式')
                        unit['status'] = 'UNREADABLE'
                    if cell_type == 's':
                        if raw is None or not raw.isdigit() or int(raw) >= len(strings):
                            raise ValueError(address + ' 共享字符串索引无效')
                        text = strings[int(raw)]
                    elif cell_type == 'inlineStr':
                        text = ''.join(t.text or '' for t in cell.findall('.//s:t', NS))
                    elif cell_type in ('n', 'str', 'b', 'e', 'd'):
                        text = raw
                        if cell_type == 'e':
                            issues.append(name + '!' + address + ' 来源单元格保存错误值 ' + (raw or ''))
                            unit['status'] = 'UNREADABLE'
                    else:
                        text = raw
                        issues.append(name + '!' + address + ' 不支持的单元格类型 ' + cell_type)
                        unit['status'] = 'UNREADABLE'
                    if text is None or not str(text).strip():
                        if formula is None:
                            continue
                        text = '公式缓存值未取得：' + (formula_text or '共享公式正文未取得')
                    blocks.append({'blockId': uid + ':' + address, 'unitId': uid, 'kind': 'TABLE_CELL',
                                   'text': str(text), 'cellRange': address, 'formula': formula_text,
                                   'cachedValue': str(raw) if formula is not None and raw is not None and str(raw).strip() else None})
                for merge in root.findall('s:mergeCells/s:mergeCell', NS):
                    issues.append(name + ' 合并范围 ' + merge.attrib.get('ref', '未知') + ' 的表头关系尚未核实')
                    unit['status'] = 'UNREADABLE'
                if any(root.find('s:' + tag, NS) is not None for tag in ['drawing', 'legacyDrawing', 'oleObjects', 'controls']):
                    issues.append(name + ' 含图形、批注或嵌入对象，尚未核实非单元格内容')
                    unit['status'] = 'UNREADABLE'
            except Exception as error:
                unit['status'] = 'FAILED'
                issues.append(name + '：' + str(error))
        for prefix, label in [('xl/externalLinks/', '外部链接'), ('xl/charts/', '图表'), ('xl/media/', '图片'), ('xl/comments', '批注'), ('xl/vbaProject', '宏')]:
            if any(name.startswith(prefix) for name in names):
                issues.append('工作簿包含' + label + '；未执行或解释该内容')
    return {'units': units, 'blocks': blocks, 'issues': issues, 'completeness': 'INCOMPLETE' if issues else 'COMPLETE'}

if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    print(json.dumps(parse(sys.argv[1]), ensure_ascii=False))
