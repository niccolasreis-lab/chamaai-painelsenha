import * as fs from 'fs';

export interface ParsedItem {
  plu: string;
  descricao: string;
  preco: number; // in cents
}

export function parseFileContent(content: string, format: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const lines = content.split(/\r?\n/);

  switch (format) {
    case 'toledo_mgv6':
      return parseToledoMGV6(lines);
    case 'toledo_mgv5':
      return parseToledoMGV5(lines);
    case 'filizola':
      return parseFilizola(lines);
    case 'gertec':
    case 'isolidus_txt':
    case 'cads_txt':
    case 'etiqueta_eletronica':
      // Fallback TXT parser for missing documentation
      return parseGenericTXT(lines);
    case 'csv_generic':
    case 'hiper_csv':
    case 'isolidus_csv':
    case 'box_csv':
    case 'bedgarline_csv':
      return parseGenericCSV(lines);
    case 'datacaixa_xlsx':
    case 'avanco_xlsx':
      // Since XLSX cannot be easily parsed via pure text lines, we fallback to a warning.
      // (Requires 'xlsx' npm package to truly read).
      console.warn(`[PARSER] O formato XLSX (${format}) requer conversão prévia para CSV ou integração com biblioteca xlsx.`);
      return [];
    default:
      console.warn(`[PARSER] Formato '${format}' não mapeado. Usando fallback TXT.`);
      return parseGenericTXT(lines);
  }
}

function parseGenericTXT(lines: string[]): ParsedItem[] {
  // Best effort for unknown TXT. Usually code and price.
  const items: ParsedItem[] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    // VERY generic fallback: splits by spaces or tabs
    const parts = line.split(/[\t]+/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const plu = parts[0];
      const desc = parts.length >= 3 ? parts[1] : `Item ${plu}`;
      const precoStr = parts[parts.length - 1].replace(',', '.');
      const preco = parseFloat(precoStr);
      if (!isNaN(preco) && preco > 0) {
        items.push({ plu, descricao: desc, preco: Math.round(preco * 100) });
      }
    }
  }
  return items;
}

function parseToledoMGV6(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  for (const line of lines) {
    if (line.length < 18) continue;
    const subtipo = line.substring(2, 5);
    if (subtipo !== '000') continue; // only KG
    
    const plu = line.substring(5, 9);
    const precoStr = line.substring(9, 15);
    const descricao = line.length >= 66 ? line.substring(18, 66).trimEnd() : line.substring(18).trimEnd();
    
    const preco = parseInt(precoStr, 10);
    if (!isNaN(preco) && preco > 0) {
      items.push({ plu, descricao, preco });
    }
  }
  return items;
}

function parseToledoMGV5(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  // TXITENS.TXT MGV5 layout (approximate standard)
  // 01-02: Dept
  // 03-04: Tipo
  // 05-10: Codigo
  // 11-16: Preco
  // 17-19: Validade
  // 20-41: Descricao
  for (const line of lines) {
    if (line.length < 20) continue;
    const plu = line.substring(4, 10).trim();
    const precoStr = line.substring(10, 16);
    const descricao = line.substring(19, 41).trimEnd();
    
    const preco = parseInt(precoStr, 10);
    if (!isNaN(preco) && preco > 0) {
      items.push({ plu, descricao, preco });
    }
  }
  return items;
}

function parseFilizola(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  // CADTXT.TXT layout
  // 01-06: Codigo
  // 07-07: Tipo (P/U)
  // 08-14: Preco (7 digits)
  // 15-17: Validade
  // 18-39: Descricao (22 digits)
  for (const line of lines) {
    if (line.length < 20) continue;
    const plu = line.substring(0, 6).trim();
    const tipo = line.substring(6, 7);
    if (tipo !== 'P') continue; // P = Peso
    const precoStr = line.substring(7, 14);
    const descricao = line.substring(17, 39).trimEnd();
    
    const preco = parseInt(precoStr, 10);
    if (!isNaN(preco) && preco > 0) {
      items.push({ plu, descricao, preco });
    }
  }
  return items;
}

function parseGenericCSV(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  if (lines.length === 0) return items;
  
  const separator = lines[0].includes(';') ? ';' : ',';
  let startIndex = 0;
  
  // check if first line is header
  const isHeader = lines[0].toLowerCase().includes('descri') || lines[0].toLowerCase().includes('preco');
  if (isHeader) startIndex = 1;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cols = line.split(separator);
    // Best effort generic CSV parsing: usually Code, Desc, Price
    // We try to find which column is price (has numbers/decimals) and which is description
    if (cols.length >= 3) {
      const plu = cols[0].replace(/"/g, '').trim();
      const descricao = cols[1].replace(/"/g, '').trim();
      let precoStr = cols[2].replace(/"/g, '').replace(',', '.').trim();
      
      const precoFloat = parseFloat(precoStr);
      if (!isNaN(precoFloat) && precoFloat > 0) {
        items.push({ plu, descricao, preco: Math.round(precoFloat * 100) });
      }
    }
  }
  return items;
}
