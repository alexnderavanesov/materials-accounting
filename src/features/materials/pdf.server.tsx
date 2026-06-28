import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'

import { demoCategorySummary, demoDocuments } from './demo-data'

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 18,
    marginBottom: 12,
  },
  muted: {
    color: '#475569',
    marginBottom: 16,
  },
  table: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  cell: {
    padding: 6,
    flexGrow: 1,
    flexBasis: 0,
  },
  header: {
    backgroundColor: '#f1f5f9',
    fontWeight: 700,
  },
})

export async function renderDocumentPdf(documentId: string) {
  const document = demoDocuments.find((item) => item.id === documentId) ?? {
    id: documentId,
    typeLabel: 'Документ',
    number: 'Без номера',
    status: 'draft',
    date: new Date().toISOString().slice(0, 10),
    title: 'Документ без позиций',
  }

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {document.typeLabel} {document.number}
        </Text>
        <Text style={styles.muted}>
          Внутренний учетный документ. Дата: {document.date}. Статус:{' '}
          {document.status}.
        </Text>
        <View style={styles.table}>
          <View style={[styles.row, styles.header]}>
            <Text style={styles.cell}>Шифр</Text>
            <Text style={styles.cell}>Материал</Text>
            <Text style={styles.cell}>План</Text>
            <Text style={styles.cell}>Выдано</Text>
            <Text style={styles.cell}>Остаток</Text>
          </View>
          {demoCategorySummary.flatMap((category) =>
            category.rows.map((row) => (
              <View
                key={`${category.category}-${row.cipher}-${row.material}`}
                style={styles.row}
              >
                <Text style={styles.cell}>{row.cipher}</Text>
                <Text style={styles.cell}>{row.material}</Text>
                <Text style={styles.cell}>
                  {row.plannedQuantity} {row.unit}
                </Text>
                <Text style={styles.cell}>{row.issued}</Text>
                <Text style={styles.cell}>{row.balance}</Text>
              </View>
            )),
          )}
        </View>
      </Page>
    </Document>,
  )
}
