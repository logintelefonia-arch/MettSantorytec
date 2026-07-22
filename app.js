const STORAGE_KEY = "controle-convenios-v2";
const LEGACY_STORAGE_KEY = "controle-unimed-v1";
const BACKUP_RESTORE_KEY = "controle-convenios-backup-restored";
const DEFAULT_PAYER = "unimed";
const PAYERS = [
  { id: "unimed", label: "Unimed" },
  { id: "caesan", label: "Caesan" },
  { id: "marinha", label: "Marinha" },
  { id: "cirurgia-segura", label: "Cirurgia segura" },
  { id: "assefaz", label: "Assefaz" },
  { id: "postal-saude", label: "Postal saúde" },
];
const SHEET_HEADERS = [
  "PEDIDO",
  "GUIA PRESTADOR",
  "GUIA OPERADORA",
  "GUIA PRINCIPAL",
  "AUTORIZAÇÃO",
  "BENEFICIÁRIO",
  "CARTEIRINHA",
  "DATA",
  "QTDE",
  "R$/UN",
  "ORIGEM",
  "CÓDIGO",
  "MODALIDADE",
  "PROCEDIMENTO",
  "VALOR (R$)",
];

const state = loadState();
applyBackupRestore();
if (!window.CONTROLE_CONVENIOS_BACKUP) {
  applySeedData();
}
const editing = {
  notes: null,
  registration: null,
};

const els = {
  registrationForm: document.querySelector("#registrationForm"),
  saveRegistration: document.querySelector("#saveRegistration"),
  notesForm: document.querySelector("#notesForm"),
  saveNotes: document.querySelector("#saveNotes"),
  clearNotes: document.querySelector("#clearNotes"),
  beneficiaryName: document.querySelector("#beneficiaryName"),
  protocolNumber: document.querySelector("#protocolNumber"),
  batchNumber: document.querySelector("#batchNumber"),
  registrationReference: document.querySelector("#registrationReference"),
  referenceName: document.querySelector("#referenceName"),
  patientNotes: document.querySelector("#patientNotes"),
  registrationRows: document.querySelector("#registrationRows"),
  protocolRows: document.querySelector("#protocolRows"),
  savedSheetsSearch: document.querySelector("#savedSheetsSearch"),
  payerSelect: document.querySelector("#payerSelect"),
  appTitle: document.querySelector("#appTitle"),
  payerPanelTitle: document.querySelector("#payerPanelTitle"),
  currentPayerLabel: document.querySelector("#currentPayerLabel"),
  searchInput: document.querySelector("#searchInput"),
  searchRows: document.querySelector("#searchRows"),
  resultCount: document.querySelector("#resultCount"),
  exportCsv: document.querySelector("#exportCsv"),
  importCsv: document.querySelector("#importCsv"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.payers) {
      return {
        activePayer: payerExists(saved.activePayer) ? saved.activePayer : DEFAULT_PAYER,
        payers: buildPayers(saved.payers),
      };
    }
  } catch {
    return createEmptyState();
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    return createEmptyState({
      unimed: {
        registrations: Array.isArray(legacy?.registrations) ? legacy.registrations : [],
        protocols: Array.isArray(legacy?.protocols) ? legacy.protocols : [],
      },
    });
  } catch {
    return createEmptyState();
  }
}

function saveState() {
  sortAllPayers();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createEmptyState(payers = {}) {
  return {
    activePayer: DEFAULT_PAYER,
    payers: buildPayers(payers),
  };
}

function buildPayers(savedPayers = {}) {
  return PAYERS.reduce((acc, payer) => {
    acc[payer.id] = normalizePayerData(savedPayers[payer.id]);
    return acc;
  }, {});
}

function normalizePayerData(data) {
  return sortPayerData({
    registrations: removeDuplicates(
      Array.isArray(data?.registrations) ? data.registrations : [],
      registrationKey,
    ),
    protocols: removeDuplicates(
      Array.isArray(data?.protocols) ? data.protocols : [],
      protocolKey,
    ),
  });
}

function payerExists(payerId) {
  return PAYERS.some((payer) => payer.id === payerId);
}

function currentPayer() {
  return PAYERS.find((payer) => payer.id === state.activePayer) || PAYERS[0];
}

function currentData() {
  if (!state.payers[state.activePayer]) {
    state.payers[state.activePayer] = normalizePayerData();
  }
  return state.payers[state.activePayer];
}

function findPayerByLabel(value) {
  const normalized = normalizeText(value);
  return PAYERS.find(
    (payer) => payer.id === value || normalizeText(payer.label) === normalized,
  );
}

function applyBackupRestore() {
  const backup = window.CONTROLE_CONVENIOS_BACKUP;
  if (!backup?.payers) return;
  const backupVersion = JSON.stringify({
    id: backup.id || "",
    activePayer: backup.activePayer || "",
    payers: backup.payers,
  });
  if (localStorage.getItem(BACKUP_RESTORE_KEY) === backupVersion) return;

  state.activePayer = payerExists(backup.activePayer) ? backup.activePayer : DEFAULT_PAYER;
  state.payers = buildPayers(backup.payers);
  localStorage.setItem(BACKUP_RESTORE_KEY, backupVersion);
  saveState();
}

function applySeedData() {
  const seed = window.UNIMED_SEED;
  if (!seed) return;

  const unimed = state.payers.unimed;
  const existingRegistrations = new Set(unimed.registrations.map((item) => item.id));
  const existingProtocols = new Set(unimed.protocols.map((item) => item.id));

  seed.registrations.forEach((item) => {
    const existing = unimed.registrations.find((row) => row.id === item.id);
    if (existing) {
      Object.assign(existing, item);
    } else if (!existingRegistrations.has(item.id)) {
      unimed.registrations.push(item);
    }
  });

  seed.protocols.forEach((item) => {
    const existing = unimed.protocols.find((row) => row.id === item.id);
    if (existing) {
      Object.assign(existing, item);
    } else if (!existingProtocols.has(item.id)) {
      unimed.protocols.push(item);
    }
  });
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeRecordValue(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function registrationKey(record) {
  return [record.beneficiary, record.protocol, record.batch, record.reference]
    .map(normalizeRecordValue)
    .join("|");
}

function protocolKey(record) {
  return [record.reference, record.patientNotes || record.patientInternals || ""]
    .map(normalizeRecordValue)
    .join("|");
}

function removeDuplicates(records, keyForRecord) {
  const keys = new Set();
  return records.filter((record) => {
    const key = keyForRecord(record);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function hasDuplicate(records, record, keyForRecord, currentId = null) {
  const key = keyForRecord(record);
  return records.some((item) => item.id !== currentId && keyForRecord(item) === key);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  sortAllPayers();
  renderPayerUi();
  renderRegistrations();
  renderProtocols();
  renderSearch();
  saveState();
}

function renderPayerUi() {
  const payer = currentPayer();
  els.payerSelect.value = payer.id;
  els.appTitle.textContent = `Guias e protocolos ${payer.label}`;
  els.payerPanelTitle.textContent = `Atendimento ${payer.label}`;
  els.currentPayerLabel.textContent = payer.label;
  document.title = `Controle ${payer.label}`;
}

function emptyRow(colspan, message = "Nenhum registro por enquanto.") {
  return `<tr><td class="empty" colspan="${colspan}">${message}</td></tr>`;
}

function renderProtocols() {
  const data = currentData();
  if (!data.protocols.length) {
    els.protocolRows.innerHTML = emptyRow(1, `Nenhuma planilha salva em ${currentPayer().label}.`);
    return;
  }

  els.protocolRows.innerHTML = `
    <tr>
      <td class="combinedCell">${renderSavedSheets()}</td>
    </tr>
  `;
}

function renderSearch() {
  const query = normalizeText(els.searchInput.value);
  const data = currentData();

  if (!query) {
    els.resultCount.textContent = "Digite para pesquisar";
    els.searchRows.innerHTML = emptyRow(4, `Pesquise o beneficiário em ${currentPayer().label}.`);
    return;
  }

  const rows = data.registrations.filter((item) =>
    normalizeText(item.beneficiary).includes(query),
  );

  els.resultCount.textContent = `${rows.length} encontrado${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    els.searchRows.innerHTML = emptyRow(4, "Não encontrado.");
    return;
  }

  els.searchRows.innerHTML = rows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.beneficiary)}</td>
          <td>${escapeHtml(item.protocol)}</td>
          <td>${escapeHtml(item.batch)}</td>
          <td>${escapeHtml(item.reference || "")}</td>
        </tr>
      `,
    )
    .join("");
}

function renderRegistrations() {
  const data = currentData();
  if (!data.registrations.length) {
    els.registrationRows.innerHTML = emptyRow(5, `Nenhum nome, protocolo, lote e referência cadastrado em ${currentPayer().label}.`);
    return;
  }

  els.registrationRows.innerHTML = data.registrations
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.beneficiary)}</td>
          <td>${escapeHtml(item.protocol)}</td>
          <td>${escapeHtml(item.batch)}</td>
          <td>${escapeHtml(item.reference || "")}</td>
          <td>
            <div class="rowActions">
              <button type="button" data-edit-registration="${item.id}">Editar</button>
              <button type="button" class="delete" data-delete-registration="${item.id}">Excluir</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderNotesTable(notes) {
  const rows = parseNotesTable(notes);
  const dataRows = stripHeaderRow(rows);

  if (!dataRows.length) {
    return "";
  }

  return `
    <div class="miniSheetWrap">
      <table class="miniSheet">
        <thead>
          <tr>${SHEET_HEADERS.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${dataRows
            .map(
              (row) => `
                <tr>
                  ${row
                    .map((cell) =>
                      `<td>${escapeHtml(cell)}</td>`,
                    )
                    .join("")}
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSavedSheets() {
  const query = normalizeText(els.savedSheetsSearch.value);
  const data = currentData();
  const parsedRecords = data.protocols
    .map((item) => ({
      id: item.id,
      reference: item.reference || "Sem referência",
      rows: stripHeaderRow(parseNotesTable(item.patientNotes || item.patientInternals || ""))
        .filter((row) => !query || normalizeText(row[5] || "").includes(query)),
    }))
    .filter((item) => item.rows.length);

  if (!parsedRecords.length) {
    return query ? `<div class="empty savedSheetsEmpty">Nenhuma planilha salva encontrada.</div>` : "";
  }

  const body = [];
  const groups = groupRecordsByReference(parsedRecords);

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      body.push(`<tr class="sheetSpacer"><td colspan="${SHEET_HEADERS.length + 1}"></td></tr>`);
    }

    body.push(`
      <tr class="referenceTitle">
        <td colspan="${SHEET_HEADERS.length + 1}">${escapeHtml(group.reference)}</td>
      </tr>
    `);

    group.records.forEach((record, recordIndex) => {
      const dataRows = record.rows;
      if (!dataRows.length) return;

      if (recordIndex > 0) {
        body.push(`<tr class="sheetSpacer"><td colspan="${SHEET_HEADERS.length + 1}"></td></tr>`);
      }

      let previousBeneficiary = "";

      dataRows.forEach((row, rowIndex) => {
        const currentBeneficiary = row[5] || "";
        if (
          rowIndex > 0 &&
          normalizeText(currentBeneficiary) !== normalizeText(previousBeneficiary)
        ) {
          body.push(`<tr class="patientNameSpacer"><td colspan="${SHEET_HEADERS.length + 1}"></td></tr>`);
        }

        const actionCell =
          rowIndex === dataRows.length - 1
            ? `<td class="sheetAction"><button type="button" class="delete" data-delete-protocol="${record.id}">Excluir</button></td>`
            : `<td class="sheetAction"></td>`;

        body.push(`
          <tr>
            ${SHEET_HEADERS.map((_, cellIndex) => `<td>${escapeHtml(row[cellIndex] || "")}</td>`).join("")}
            ${actionCell}
          </tr>
        `);
        previousBeneficiary = currentBeneficiary;
      });
    });
  });

  return `
    <div class="combinedSheetWrap">
      <table class="miniSheet combinedSheet">
        <thead>
          <tr>
            ${SHEET_HEADERS.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>${body.join("")}</tbody>
      </table>
    </div>
  `;
}

function groupRecordsByReference(records) {
  const groups = new Map();

  records.forEach((record) => {
    if (!groups.has(record.reference)) {
      groups.set(record.reference, []);
    }
    groups.get(record.reference).push(record);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => compareReference(left, right))
    .map(([reference, groupedRecords]) => ({
      reference,
      records: groupedRecords,
    }));
}

function compareReference(left, right) {
  const leftDate = referenceSortValue(left);
  const rightDate = referenceSortValue(right);

  if (leftDate !== rightDate) {
    return leftDate - rightDate;
  }

  return normalizeText(left).localeCompare(normalizeText(right), "pt-BR");
}

function referenceSortValue(value) {
  const text = String(value || "");
  const monthYear = text.match(/(?:mes|m[eê]s)?\s*(0?[1-9]|1[0-2])\s*[-/]\s*(20\d{2}|\d{2})/i);
  if (monthYear) {
    return makeMonthSortValue(monthYear[2], monthYear[1]);
  }

  const yearMonth = text.match(/\b(20\d{2})\s*[-/]\s*(0?[1-9]|1[0-2])\b/);
  if (yearMonth) {
    return makeMonthSortValue(yearMonth[1], yearMonth[2]);
  }

  const firstNumber = text.match(/\d+/);
  return firstNumber ? Number(firstNumber[0]) : Number.MAX_SAFE_INTEGER;
}

function makeMonthSortValue(year, month) {
  const fullYear = String(year).length === 2 ? Number(`20${year}`) : Number(year);
  return fullYear * 100 + Number(month);
}

function compareRecordOrder(left, right) {
  // A referência define a ordem. Dentro dela, usa-se a sequência de salvamento/importação.
  const referenceOrder = compareReference(left.reference || "", right.reference || "");
  if (referenceOrder !== 0) return referenceOrder;

  return recordSaveOrder(left) - recordSaveOrder(right);
}

function recordSaveOrder(record) {
  if (Number.isFinite(Number(record.createdAt))) return Number(record.createdAt);

  const timestampFromId = String(record.id || "").match(/^(\d{10,})-/);
  if (timestampFromId) return Number(timestampFromId[1]);

  const seedRecords = [
    ...(window.UNIMED_SEED?.registrations || []),
    ...(window.UNIMED_SEED?.protocols || []),
  ];
  const seedIndex = seedRecords.findIndex((item) => item.id === record.id);
  return seedIndex >= 0 ? seedIndex : Number.MAX_SAFE_INTEGER;
}

function sortPayerData(data) {
  data.registrations = removeDuplicates(data.registrations, registrationKey);
  data.protocols = removeDuplicates(data.protocols, protocolKey);
  data.registrations.sort(compareRecordOrder);
  data.protocols.sort(compareRecordOrder);
  return data;
}

function sortAllPayers() {
  Object.values(state.payers).forEach(sortPayerData);
}

function parseNotesTable(notes) {
  const text = String(notes || "").trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hasTabs = lines.some((line) => line.includes("\t"));

  if (hasTabs) {
    return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
  }

  return lines.map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()));
}

function stripHeaderRow(rows) {
  if (!rows.length) return [];
  const firstRow = rows[0].map(normalizeText);
  const expectedHeaders = SHEET_HEADERS.map(normalizeText);
  const matchingHeaders = expectedHeaders.filter((header, index) =>
    firstRow[index]?.includes(header),
  );

  return matchingHeaders.length >= 5 ? rows.slice(1) : rows;
}

function extractBeneficiary(notes) {
  const rows = parseNotesTable(notes);
  const header = rows[0] || [];
  const beneficiaryIndex = header.findIndex((cell) =>
    normalizeText(cell).includes("beneficiario"),
  );

  if (beneficiaryIndex >= 0) {
    const found = rows.slice(1).find((row) => row[beneficiaryIndex]);
    if (found) return found[beneficiaryIndex];
  }

  const ignored = new Set(["PRONTO SOCORRO", "MATMED", "UNIMED"]);
  for (const line of String(notes || "").split(/\r?\n/)) {
    const matches = line.match(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}){1,}/g) || [];
    const name = matches.find((value) => !ignored.has(value.trim()));
    if (name) return name.trim();
  }

  return "";
}

els.notesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = currentData();

  const notes = els.patientNotes.value.trim();
  if (!notes) return;

  const record = {
    id: editing.notes ?? makeId(),
    createdAt: editing.notes
      ? (data.protocols.find((item) => item.id === editing.notes)?.createdAt ?? Date.now())
      : Date.now(),
    beneficiary: "",
    protocol: "",
    batch: "",
    reference: els.referenceName.value.trim(),
    patientNotes: notes,
  };

  if (editing.notes) {
    if (hasDuplicate(data.protocols, record, protocolKey, editing.notes)) {
      alert("Esta planilha já está salva. Nenhum dado foi duplicado.");
      return;
    }
    const index = data.protocols.findIndex((item) => item.id === editing.notes);
    data.protocols[index] = record;
    editing.notes = null;
    els.saveNotes.textContent = "Salvar planilha";
  } else {
    if (hasDuplicate(data.protocols, record, protocolKey)) {
      alert("Esta planilha já está salva. Nenhum dado foi duplicado.");
      return;
    }
    data.protocols.push(record);
  }

  els.notesForm.reset();
  render();
});

els.clearNotes.addEventListener("click", () => {
  editing.notes = null;
  els.notesForm.reset();
  els.saveNotes.textContent = "Salvar planilha";
});

els.registrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = currentData();

  const record = {
    id: editing.registration ?? makeId(),
    createdAt: editing.registration
      ? (data.registrations.find((item) => item.id === editing.registration)?.createdAt ?? Date.now())
      : Date.now(),
    beneficiary: els.beneficiaryName.value.trim(),
    protocol: els.protocolNumber.value.trim(),
    batch: els.batchNumber.value.trim(),
    reference: els.registrationReference.value.trim(),
  };

  if (editing.registration) {
    if (hasDuplicate(data.registrations, record, registrationKey, editing.registration)) {
      alert("Este cadastro já existe. Nenhum dado foi duplicado.");
      return;
    }
    const index = data.registrations.findIndex((item) => item.id === editing.registration);
    data.registrations[index] = record;
    editing.registration = null;
    els.saveRegistration.textContent = "Cadastrar";
  } else {
    if (hasDuplicate(data.registrations, record, registrationKey)) {
      alert("Este cadastro já existe. Nenhum dado foi duplicado.");
      return;
    }
    data.registrations.push(record);
  }

  els.registrationForm.reset();
  render();
});

document.addEventListener("click", (event) => {
  const data = currentData();
  const editNotes = event.target.closest("[data-edit-notes]");
  const editRegistration = event.target.closest("[data-edit-registration]");
  const deleteRegistration = event.target.closest("[data-delete-registration]");
  const deleteProtocol = event.target.closest("[data-delete-protocol]");

  if (editRegistration) {
    const item = data.registrations.find(
      (row) => row.id === editRegistration.dataset.editRegistration,
    );
    if (!item) return;
    editing.registration = item.id;
    els.beneficiaryName.value = item.beneficiary;
    els.protocolNumber.value = item.protocol;
    els.batchNumber.value = item.batch;
    els.registrationReference.value = item.reference || "";
    els.saveRegistration.textContent = "Salvar";
  }

  if (editNotes) {
    const item = data.protocols.find((row) => row.id === editNotes.dataset.editNotes);
    if (!item) return;
    editing.notes = item.id;
    els.referenceName.value = item.reference || "";
    els.patientNotes.value = item.patientNotes || item.patientInternals || "";
    els.saveNotes.textContent = "Salvar alteração";
    els.patientNotes.focus();
  }

  if (deleteProtocol) {
    data.protocols = data.protocols.filter(
      (row) => row.id !== deleteProtocol.dataset.deleteProtocol,
    );
    render();
  }

  if (deleteRegistration) {
    data.registrations = data.registrations.filter(
      (row) => row.id !== deleteRegistration.dataset.deleteRegistration,
    );
    render();
  }
});

function resetEditingState() {
  editing.notes = null;
  editing.registration = null;
  els.notesForm.reset();
  els.registrationForm.reset();
  els.searchInput.value = "";
  els.savedSheetsSearch.value = "";
  els.saveNotes.textContent = "Salvar planilha";
  els.saveRegistration.textContent = "Cadastrar";
}

els.payerSelect.addEventListener("change", () => {
  state.activePayer = payerExists(els.payerSelect.value) ? els.payerSelect.value : DEFAULT_PAYER;
  resetEditingState();
  render();
});

els.searchInput.addEventListener("input", renderSearch);
els.savedSheetsSearch.addEventListener("input", renderProtocols);

els.exportCsv.addEventListener("click", () => {
  const lines = [
    ["convenio", "tipo", "referencia", "nome_beneficiario", "protocolo", "lote", "observacoes"],
  ];

  PAYERS.forEach((payer) => {
    const data = state.payers[payer.id];
    data.registrations.forEach((item) => {
      lines.push([
        payer.label,
        "cadastro",
        item.reference || "",
        item.beneficiary,
        item.protocol,
        item.batch,
        "",
      ]);
    });
    data.protocols.forEach((item) => {
      lines.push([
        payer.label,
        "planilha",
        item.reference || "",
        "",
        "",
        "",
        item.patientNotes || item.patientInternals || "",
      ]);
    });
  });

  const csv = lines.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "controle-convenios.csv";
  link.click();
  URL.revokeObjectURL(url);
});

els.importCsv.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  const [header, ...data] = rows;
  if (!header) {
    alert("O arquivo selecionado esta vazio ou nao pode ser lido como CSV.");
    event.target.value = "";
    return;
  }

  const hasPayerColumn = normalizeText(header?.[0] || "") === "convenio";
  const typeIndex = hasPayerColumn ? 1 : 0;
  const referenceIndex = hasPayerColumn ? 2 : 1;
  const hasReferenceColumn = normalizeText(header?.[referenceIndex] || "") === "referencia";
  const importedPayers = buildPayers();
  let importedCount = 0;
  let duplicateCount = 0;

  data.forEach((row) => {
    const payer = hasPayerColumn
      ? findPayerByLabel(row[0]?.trim() || "")
      : currentPayer();
    if (!payer) return;

    const target = importedPayers[payer.id];
    const type = normalizeText(row[typeIndex] || "");
    const beneficiaryIndex = hasReferenceColumn ? typeIndex + 2 : typeIndex + 1;
    const protocolIndex = hasReferenceColumn ? typeIndex + 3 : typeIndex + 2;
    const batchIndex = hasReferenceColumn ? typeIndex + 4 : typeIndex + 3;
    const notesIndex = hasReferenceColumn ? typeIndex + 5 : typeIndex + 4;

    if (type === "cadastro") {
      const record = {
        id: makeId(),
        createdAt: Date.now(),
        beneficiary: row[beneficiaryIndex]?.trim() ?? "",
        protocol: row[protocolIndex]?.trim() ?? "",
        batch: row[batchIndex]?.trim() ?? "",
        reference: hasReferenceColumn ? row[referenceIndex]?.trim() ?? "" : "",
      };
      if (hasDuplicate(target.registrations, record, registrationKey)) {
        duplicateCount += 1;
      } else {
        target.registrations.push(record);
        importedCount += 1;
      }
    }

    if (type === "planilha") {
      const record = {
        id: makeId(),
        createdAt: Date.now(),
        beneficiary: "",
        protocol: "",
        batch: "",
        reference: hasReferenceColumn ? row[referenceIndex]?.trim() ?? "" : "",
        patientNotes: row[notesIndex]?.trim() ?? "",
      };
      if (hasDuplicate(target.protocols, record, protocolKey)) {
        duplicateCount += 1;
      } else {
        target.protocols.push(record);
        importedCount += 1;
      }
    }
  });

  if (!importedCount) {
    alert("Nenhum registro foi importado. Confira se o CSV tem as colunas tipo, nome_beneficiario, protocolo e lote.");
    event.target.value = "";
    return;
  }

  state.payers = importedPayers;
  event.target.value = "";
  resetEditingState();
  render();
  if (duplicateCount) {
    alert(`${importedCount} registro(s) importado(s). ${duplicateCount} duplicado(s) foram ignorados.`);
  }
});

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsv(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiters = [";", ",", "\t"];

  return delimiters.reduce((best, delimiter) => {
    const count = countDelimiter(firstLine, delimiter);
    return count > best.count ? { delimiter, count } : best;
  }, { delimiter: ";", count: 0 }).delimiter;
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      count += 1;
    }
  }

  return count;
}

render();
