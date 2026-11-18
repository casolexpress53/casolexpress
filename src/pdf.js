/* Geração de PDF (carrega a biblioteca só quando o usuário pede). */
export async function gerarPdf({ titulo, subtitulo, colunas, linhas, resumo = [], arquivo, nota }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(titulo, 40, 52);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110);
  doc.text(subtitulo, 40, 70);
  let y = 94;
  doc.setTextColor(20);
  for (const [k, v] of resumo) { doc.setFont('helvetica', 'normal'); doc.text(k, 40, y); doc.setFont('helvetica', 'bold'); doc.text(String(v), 230, y); y += 16; }
  autoTable(doc, {
    head: [colunas], body: linhas, startY: y + 8,
    styles: { fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [200, 16, 28], textColor: 255 },
    alternateRowStyles: { fillColor: [247, 246, 243] },
  });
  if (nota) { doc.setFontSize(8); doc.setTextColor(110); doc.text(doc.splitTextToSize(nota, 515), 40, doc.lastAutoTable.finalY + 18); }
  doc.setFontSize(8); doc.setTextColor(140);
  doc.text('Casol Express · Gestão', 40, doc.internal.pageSize.getHeight() - 24);
  doc.save(arquivo);
}
