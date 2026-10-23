// STATUS: GOLD — localizes stable Publish preflight, TIC and verification-suite results.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';
import type { IccProfileId } from './prepress/publishPrepressEngine';

type SuiteId = 'VPUBLISH_CONTAINER_SEAL_ROUNDTRIP' | 'PDFX_PREPRESS_OUTPUT_INTENT' | 'TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS' | 'TYPOGRAPHIC_FRAME_THREADING_INVARIANTS' | 'ACCESSIBLE_TAGGED_PDF_STRUCTURE' | 'THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY';
type SuiteStatus = 'passed' | 'failed' | 'warning';
type SuiteRow = { name: string; description: string };
type PublishAdvancedLocale = {
  profileDescriptions: Record<IccProfileId, string>;
  ticFinding: string;
  ticFindingUnknown: string;
  findingUnknown: string;
  suiteStatus: Record<SuiteStatus, string>;
  suiteResults: Record<SuiteId | 'unknown', SuiteRow>;
};

const COPY: Readonly<Record<WorkspaceLocale, PublishAdvancedLocale>> = {
  'en-US': {
    profileDescriptions: { FOGRA39: 'European sheet-fed offset profile for coated stock.', FOGRA51: 'Modern European offset profile with OBA compensation.', SWOP_2006: 'North American web offset publication profile.', GRACOL_2013: 'North American commercial sheet-fed G7 profile.' },
    ticFinding: 'Total ink coverage exceeds the limit ({actual}% > {limit}%).', ticFindingUnknown: 'Total ink coverage limit was exceeded; details are unavailable.', findingUnknown: 'This preflight finding has no recognized description.',
    suiteStatus: { passed: 'Passed', failed: 'Failed', warning: 'Warning' },
    suiteResults: {
      VPUBLISH_CONTAINER_SEAL_ROUNDTRIP: { name: 'Native .vpub container seal and roundtrip', description: 'Checks local container serialization, frame/page counts and the SHA-256 seal.' },
      PDFX_PREPRESS_OUTPUT_INTENT: { name: 'PDF/X output intent and printer marks', description: 'Checks generated PDF/X output intent and required prepress marks.' },
      TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS: { name: 'Total ink coverage diagnostics', description: 'Compares measured ink coverage with the selected profile limit.' },
      TYPOGRAPHIC_FRAME_THREADING_INVARIANTS: { name: 'Typography and overflow diagnostics', description: 'Checks text-frame capacity estimates and column-threading bounds.' },
      ACCESSIBLE_TAGGED_PDF_STRUCTURE: { name: 'Tagged PDF reading order', description: 'Checks generated frame order and the tagged-PDF structure report.' },
      THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY: { name: 'IDML and Scribus interchange fixture', description: 'Checks the bounded XML interchange fixture and frame serialization.' },
      unknown: { name: 'Additional verification result', description: 'This result code is not recognized; diagnostic details are unavailable.' },
    },
  },
  'de-DE': {
    profileDescriptions: { FOGRA39: 'Europäisches Bogenoffsetprofil für gestrichenes Papier.', FOGRA51: 'Modernes europäisches Offsetprofil mit OBA-Kompensation.', SWOP_2006: 'Nordamerikanisches Weboffsetprofil für Publikationen.', GRACOL_2013: 'Nordamerikanisches G7-Profil für kommerziellen Bogenoffset.' },
    ticFinding: 'Der Gesamtfarbauftrag überschreitet den Grenzwert ({actual}% > {limit}%).', ticFindingUnknown: 'Der Grenzwert für den Gesamtfarbauftrag wurde überschritten; Details sind nicht verfügbar.', findingUnknown: 'Für diesen Preflight-Befund gibt es keine bekannte Beschreibung.',
    suiteStatus: { passed: 'Bestanden', failed: 'Fehlgeschlagen', warning: 'Warnung' },
    suiteResults: {
      VPUBLISH_CONTAINER_SEAL_ROUNDTRIP: { name: 'Prüfsiegel und Roundtrip des nativen .vpub-Containers', description: 'Prüft lokale Containerserialisierung, Frame-/Seitenzahlen und SHA-256-Prüfsiegel.' },
      PDFX_PREPRESS_OUTPUT_INTENT: { name: 'PDF/X-Ausgabeprofil und Druckmarken', description: 'Prüft das erzeugte PDF/X-Ausgabeprofil und erforderliche Druckvorstufenmarken.' },
      TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS: { name: 'Diagnose des Gesamtfarbauftrags', description: 'Vergleicht den gemessenen Farbauftrag mit dem Grenzwert des ausgewählten Profils.' },
      TYPOGRAPHIC_FRAME_THREADING_INVARIANTS: { name: 'Typografie- und Überlaufdiagnose', description: 'Prüft geschätzte Textrahmenkapazität und Grenzen des Spaltenflusses.' },
      ACCESSIBLE_TAGGED_PDF_STRUCTURE: { name: 'Lesereihenfolge im getaggten PDF', description: 'Prüft die erzeugte Frame-Reihenfolge und den Bericht zur PDF-Struktur.' },
      THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY: { name: 'IDML- und Scribus-Austauschtest', description: 'Prüft den begrenzten XML-Austauschtest und die Frame-Serialisierung.' },
      unknown: { name: 'Zusätzliches Prüfergebnis', description: 'Dieser Ergebnisschlüssel ist unbekannt; Diagnosedetails sind nicht verfügbar.' },
    },
  },
  'es-ES': {
    profileDescriptions: { FOGRA39: 'Perfil europeo de offset de pliego para papel estucado.', FOGRA51: 'Perfil europeo moderno de offset con compensación OBA.', SWOP_2006: 'Perfil norteamericano de offset de bobina para publicaciones.', GRACOL_2013: 'Perfil G7 norteamericano para impresión comercial en pliego.' },
    ticFinding: 'La cobertura total de tinta supera el límite ({actual}% > {limit}%).', ticFindingUnknown: 'Se superó el límite de cobertura de tinta; no hay detalles disponibles.', findingUnknown: 'Este resultado de preflight no tiene una descripción reconocida.',
    suiteStatus: { passed: 'Superada', failed: 'Fallida', warning: 'Aviso' },
    suiteResults: {
      VPUBLISH_CONTAINER_SEAL_ROUNDTRIP: { name: 'Sello y ciclo del contenedor .vpub nativo', description: 'Comprueba la serialización local, el recuento de páginas/marcos y el sello SHA-256.' },
      PDFX_PREPRESS_OUTPUT_INTENT: { name: 'Perfil de salida PDF/X y marcas de impresión', description: 'Comprueba el perfil PDF/X generado y las marcas de preimpresión requeridas.' },
      TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS: { name: 'Diagnóstico de cobertura total de tinta', description: 'Compara la cobertura medida con el límite del perfil seleccionado.' },
      TYPOGRAPHIC_FRAME_THREADING_INVARIANTS: { name: 'Diagnóstico tipográfico y de desbordamiento', description: 'Comprueba la capacidad estimada de los marcos de texto y los límites de columnas.' },
      ACCESSIBLE_TAGGED_PDF_STRUCTURE: { name: 'Orden de lectura del PDF etiquetado', description: 'Comprueba el orden generado de los marcos y el informe de estructura PDF.' },
      THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY: { name: 'Prueba de intercambio IDML y Scribus', description: 'Comprueba el fixture XML acotado y la serialización de marcos.' },
      unknown: { name: 'Resultado de verificación adicional', description: 'El código de este resultado no se reconoce; los detalles no están disponibles.' },
    },
  },
  'it-IT': {
    profileDescriptions: { FOGRA39: 'Profilo europeo offset a foglio per carta patinata.', FOGRA51: 'Profilo offset europeo moderno con compensazione OBA.', SWOP_2006: 'Profilo nordamericano web offset per pubblicazioni.', GRACOL_2013: 'Profilo G7 nordamericano per offset commerciale a foglio.' },
    ticFinding: 'La copertura totale dell’inchiostro supera il limite ({actual}% > {limit}%).', ticFindingUnknown: 'Il limite della copertura totale dell’inchiostro è stato superato; dettagli non disponibili.', findingUnknown: 'Questo risultato di preflight non ha una descrizione riconosciuta.',
    suiteStatus: { passed: 'Superato', failed: 'Non superato', warning: 'Avviso' },
    suiteResults: {
      VPUBLISH_CONTAINER_SEAL_ROUNDTRIP: { name: 'Sigillo e roundtrip del contenitore .vpub nativo', description: 'Verifica serializzazione locale, conteggio di pagine/riquadri e sigillo SHA-256.' },
      PDFX_PREPRESS_OUTPUT_INTENT: { name: 'Profilo di output PDF/X e segni di stampa', description: 'Verifica il profilo PDF/X generato e i segni prestampa richiesti.' },
      TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS: { name: 'Diagnostica della copertura totale dell’inchiostro', description: 'Confronta la copertura misurata con il limite del profilo selezionato.' },
      TYPOGRAPHIC_FRAME_THREADING_INVARIANTS: { name: 'Diagnostica tipografica e del testo eccedente', description: 'Verifica la capacità stimata delle cornici di testo e i limiti del flusso tra colonne.' },
      ACCESSIBLE_TAGGED_PDF_STRUCTURE: { name: 'Ordine di lettura del PDF con tag', description: 'Verifica l’ordine generato dei riquadri e il rapporto della struttura PDF.' },
      THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY: { name: 'Fixture di scambio IDML e Scribus', description: 'Verifica la fixture XML limitata e la serializzazione dei riquadri.' },
      unknown: { name: 'Risultato di verifica aggiuntivo', description: 'Il codice di questo risultato non è riconosciuto; i dettagli non sono disponibili.' },
    },
  },
  'ja-JP': {
    profileDescriptions: { FOGRA39: 'コート紙向けの欧州枚葉オフセットプロファイル。', FOGRA51: 'OBA 補正を備えた最新の欧州オフセットプロファイル。', SWOP_2006: '北米出版向けの輪転オフセットプロファイル。', GRACOL_2013: '北米商業枚葉印刷向けの G7 プロファイル。' },
    ticFinding: '総インキ量が上限を超えています ({actual}% > {limit}%)。', ticFindingUnknown: '総インキ量の上限を超えました。詳細はありません。', findingUnknown: 'このプリフライト結果の説明は認識できません。',
    suiteStatus: { passed: '合格', failed: '失敗', warning: '警告' },
    suiteResults: {
      VPUBLISH_CONTAINER_SEAL_ROUNDTRIP: { name: 'ネイティブ .vpub コンテナーの封印と往復検証', description: 'ローカルのコンテナー直列化、ページ/フレーム数、SHA-256 封印を確認します。' },
      PDFX_PREPRESS_OUTPUT_INTENT: { name: 'PDF/X 出力インテントと印刷マーク', description: '生成された PDF/X 出力インテントと必要な印刷準備マークを確認します。' },
      TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS: { name: '総インキ量の診断', description: '測定したインキ量を選択プロファイルの上限と比較します。' },
      TYPOGRAPHIC_FRAME_THREADING_INVARIANTS: { name: '組版とあふれの診断', description: 'テキストフレームの容量推定と段組みの境界を確認します。' },
      ACCESSIBLE_TAGGED_PDF_STRUCTURE: { name: 'タグ付き PDF の読み上げ順序', description: '生成されたフレーム順序と PDF 構造レポートを確認します。' },
      THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY: { name: 'IDML と Scribus の交換テスト', description: '範囲限定の XML テストデータとフレーム直列化を確認します。' },
      unknown: { name: '追加の検証結果', description: '結果コードを認識できません。診断の詳細はありません。' },
    },
  },
  'ru-RU': {
    profileDescriptions: { FOGRA39: 'Европейский профиль листовой офсетной печати для мелованной бумаги.', FOGRA51: 'Современный европейский офсетный профиль с компенсацией OBA.', SWOP_2006: 'Североамериканский профиль рулонной печати для публикаций.', GRACOL_2013: 'Североамериканский профиль G7 для коммерческой листовой печати.' },
    ticFinding: 'Суммарное красочное покрытие превышает предел ({actual}% > {limit}%).', ticFindingUnknown: 'Превышен предел суммарного красочного покрытия; подробности недоступны.', findingUnknown: 'Для этого результата предпечатной проверки нет распознанного описания.',
    suiteStatus: { passed: 'Пройдено', failed: 'Не пройдено', warning: 'Предупреждение' },
    suiteResults: {
      VPUBLISH_CONTAINER_SEAL_ROUNDTRIP: { name: 'Проверка печати и цикла контейнера .vpub', description: 'Проверяет локальную сериализацию, количество страниц/кадров и печать SHA-256.' },
      PDFX_PREPRESS_OUTPUT_INTENT: { name: 'Профиль вывода PDF/X и метки печати', description: 'Проверяет созданный профиль PDF/X и необходимые метки допечатной подготовки.' },
      TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS: { name: 'Диагностика суммарного красочного покрытия', description: 'Сравнивает измеренное покрытие с пределом выбранного профиля.' },
      TYPOGRAPHIC_FRAME_THREADING_INVARIANTS: { name: 'Диагностика типографики и переполнения', description: 'Проверяет оценку вместимости текстовых рамок и границы колонок.' },
      ACCESSIBLE_TAGGED_PDF_STRUCTURE: { name: 'Порядок чтения тегированного PDF', description: 'Проверяет сформированный порядок кадров и отчет о структуре PDF.' },
      THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY: { name: 'Тест обмена IDML и Scribus', description: 'Проверяет ограниченный XML-набор и сериализацию кадров.' },
      unknown: { name: 'Дополнительный результат проверки', description: 'Код результата не распознан; сведения диагностики недоступны.' },
    },
  },
  'zh-CN': {
    profileDescriptions: { FOGRA39: '适用于铜版纸的欧洲单张纸胶印配置。', FOGRA51: '带有 OBA 补偿的现代欧洲胶印配置。', SWOP_2006: '适用于出版物的北美卷筒纸胶印配置。', GRACOL_2013: '适用于北美商业单张纸印刷的 G7 配置。' },
    ticFinding: '总油墨覆盖率超过上限（{actual}% > {limit}%）。', ticFindingUnknown: '总油墨覆盖率超过上限；没有可用详情。', findingUnknown: '此印前检查结果没有可识别的说明。',
    suiteStatus: { passed: '通过', failed: '失败', warning: '警告' },
    suiteResults: {
      VPUBLISH_CONTAINER_SEAL_ROUNDTRIP: { name: '原生 .vpub 容器封印与往返检查', description: '检查本地容器序列化、页面/画框数量及 SHA-256 封印。' },
      PDFX_PREPRESS_OUTPUT_INTENT: { name: 'PDF/X 输出意图和印刷标记', description: '检查生成的 PDF/X 输出意图及所需印前标记。' },
      TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS: { name: '总油墨覆盖率诊断', description: '将测得的油墨覆盖率与所选配置上限进行比较。' },
      TYPOGRAPHIC_FRAME_THREADING_INVARIANTS: { name: '排版与溢出诊断', description: '检查文本框容量估算和分栏边界。' },
      ACCESSIBLE_TAGGED_PDF_STRUCTURE: { name: '带标签 PDF 的阅读顺序', description: '检查生成的画框顺序和 PDF 结构报告。' },
      THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY: { name: 'IDML 与 Scribus 交换测试', description: '检查有限范围的 XML 测试数据和画框序列化。' },
      unknown: { name: '其他验证结果', description: '无法识别此结果代码；诊断详情不可用。' },
    },
  },
};

export const PUBLISH_ADVANCED_COPY = COPY;
export function publishProfileDescription(profileId: IccProfileId, locale: WorkspaceLocale): string { return COPY[locale].profileDescriptions[profileId]; }
export function publishTicViolationText(description: string, locale: WorkspaceLocale): string {
  const match = /^Total Ink Coverage exceeds limit \(([\d.]+)% > ([\d.]+)%\)\.$/.exec(description);
  if (!match) return COPY[locale].ticFindingUnknown;
  return COPY[locale].ticFinding.replace('{actual}', match[1]!).replace('{limit}', match[2]!);
}
export function publishUnknownFindingText(locale: WorkspaceLocale): string { return COPY[locale].findingUnknown; }
export function publishVerificationResultText(id: string, status: SuiteStatus, locale: WorkspaceLocale): SuiteRow & { status: string } {
  const rows = COPY[locale].suiteResults;
  const known = Object.prototype.hasOwnProperty.call(rows, id);
  const row = rows[known ? id as SuiteId : 'unknown'];
  return { ...row, status: COPY[locale].suiteStatus[status] };
}
