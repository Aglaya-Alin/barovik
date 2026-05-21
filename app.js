import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const state = {
    dict: "cancer_types",
    rows: [],
    sortKey: null,
    sortDir: "asc",
    selectedId: null,
    editing: null,
    cancerTypes: []
};

const columns = {
    cancer_types: [
        { key: "name", label: "Название рака", type: "text" },
        { key: "mortality", label: "Смертность (%)", type: "number", step: "0.01" },
        { key: "desc", label: "Описание", type: "textarea" }
    ],
    users: [
        { key: "name", label: "ФИО", type: "text" },
        { key: "age", label: "Возраст", type: "number", step: "1" },
        { key: "gender", label: "Пол", type: "select", options: ["m", "f"] },
        { key: "cancerIds", label: "Тип рака (FK)", type: "ref_multiple" },
        { key: "diagDate", label: "Дата диагноза", type: "date" }
    ]
};

function getSortedRows() {
    if (!state.sortKey) return state.rows;
    const colConfig = columns[state.dict].find(c => c.key === state.sortKey);
    return [...state.rows].sort((a, b) => {
        let av = a[state.sortKey];
        let bv = b[state.sortKey];
        if (colConfig?.type === "number") {
            return state.sortDir === "asc" ? (parseFloat(av) || 0) - (parseFloat(bv) || 0) : (parseFloat(bv) || 0) - (parseFloat(av) || 0);
        }
        if (colConfig?.type === "date") {
            return state.sortDir === "asc" ? new Date(av || 0) - new Date(bv || 0) : new Date(bv || 0) - new Date(av || 0);
        }
        av = String(av || "").toLowerCase();
        bv = String(bv || "").toLowerCase();
        return state.sortDir === "asc" ? av.localeCompare(bv, 'ru') : bv.localeCompare(av, 'ru');
    });
}

async function renderFields() {
    const container = document.getElementById("formFields");
    container.innerHTML = "";
    const record = state.editing || {};
    for (const c of columns[state.dict]) {
        let control = "";
        const val = record[c.key] || "";
        if (c.type === "ref_multiple") {
            const options = state.cancerTypes.map(ct => `<option value="${ct.id}" ${val && val.includes(ct.id) ? 'selected' : ''}>${ct.name}</option>`).join("");
            control = `<select name="${c.key}" multiple required>${options}</select>`;
        } else if (c.type === "number") {
            control = `<input type="number" name="${c.key}" step="${c.step}" value="${val}" required>`;
        } else if (c.type === "textarea") {
            control = `<textarea name="${c.key}">${val}</textarea>`;
        } else if (c.type === "date") {
            control = `<input type="date" name="${c.key}" value="${val}" required>`;
        } else if (c.type === "select") {
            const opts = c.options.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o === 'm' ? 'Мужской' : 'Женский'}</option>`).join("");
            control = `<select name="${c.key}">${opts}</select>`;
        } else {
            control = `<input type="text" name="${c.key}" value="${val}" required>`;
        }
        container.innerHTML += `<div class="field"><label>${c.label}</label>${control}</div>`;
    }
}

document.getElementById("recordForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {};
    columns[state.dict].forEach(c => {
        if (c.type === "ref_multiple") {
            data[c.key] = fd.getAll(c.key);
        } else if (c.type === "number") {
            data[c.key] = parseFloat(fd.get(c.key));
        } else {
            data[c.key] = fd.get(c.key);
        }
    });
    if (state.editing) {
        await updateDoc(doc(db, state.dict, state.editing.id), data);
    } else {
        await addDoc(collection(db, state.dict), data);
    }
    document.getElementById("recordDialog").close();
    refreshAll();
};

async function refreshAll() {
    const ctSnap = await getDocs(collection(db, "cancer_types"));
    state.cancerTypes = ctSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const snap = await getDocs(collection(db, state.dict));
    state.rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
}

function renderTable() {
    const wrap = document.getElementById("tableWrap");
    const cols = columns[state.dict];
    const rows = getSortedRows();
    if (rows.length === 0) {
        wrap.innerHTML = `<div style="padding:40px;text-align:center;color:#64748b;">Нет данных</div>`;
        return;
    }
    let html = `<table><thead><tr>`;
    cols.forEach(c => {
        const arrow = state.sortKey === c.key ? (state.sortDir === "asc" ? " ▴" : " ▾") : "";
        html += `<th onclick="window.handleSort('${c.key}')">${c.label}${arrow}</th>`;
    });
    html += `</tr></thead><tbody>`;
    rows.forEach(row => {
        const selected = row.id === state.selectedId ? "class='selected'" : "";
        html += `<tr ${selected} onclick="window.handleRowClick('${row.id}')">`;
        cols.forEach(c => {
            let val = row[c.key];
            if (c.type === "date") val = val ? new Date(val).toLocaleDateString("ru-RU") : "—";
            if (c.type === "ref_multiple") val = (val || []).map(id => state.cancerTypes.find(ct => ct.id === id)?.name || "—").join(", ");
            if (c.key === "mortality" && val !== undefined) val = parseFloat(val).toFixed(2);
            html += `<td>${val || "—"}</td>`;
        });
        html += `</tr>`;
    });
    wrap.innerHTML = html + `</tbody></table>`;
}

window.handleSort = (key) => {
    state.sortDir = (state.sortKey === key && state.sortDir === "asc") ? "desc" : "asc";
    state.sortKey = key;
    renderTable();
};

window.handleRowClick = (id) => {
    state.selectedId = id;
    renderTable();
};

document.getElementById("addBtn").onclick = () => {
    state.editing = null;
    renderFields();
    document.getElementById("recordTitle").innerText = "Новая запись";
    document.getElementById("recordDialog").showModal();
};

document.getElementById("editBtn").onclick = () => {
    if (!state.selectedId) return alert("Выберите строку");
    state.editing = state.rows.find(r => r.id === state.selectedId);
    renderFields();
    document.getElementById("recordTitle").innerText = "Редактирование";
    document.getElementById("recordDialog").showModal();
};

document.getElementById("viewBtn").onclick = () => {
    if (!state.selectedId) return alert("Выберите строку");
    const row = state.rows.find(r => r.id === state.selectedId);
    let html = "";
    columns[state.dict].forEach(c => {
        let val = row[c.key];
        if (c.type === "date") val = val ? new Date(val).toLocaleDateString("ru-RU") : "—";
        if (c.type === "ref_multiple") val = (val || []).map(id => state.cancerTypes.find(ct => ct.id === id)?.name).join(", ");
        html += `<p><strong>${c.label}:</strong> <span>${val || "—"}</span></p>`;
    });
    document.getElementById("viewContent").innerHTML = html;
    document.getElementById("viewDialog").showModal();
};

document.getElementById("deleteBtn").onclick = async () => {
    if (!state.selectedId) return alert("Выберите строку");
    if (confirm("Удалить запись?")) {
        await deleteDoc(doc(db, state.dict, state.selectedId));
        state.selectedId = null;
        refreshAll();
    }
};

document.getElementById("refreshBtn").onclick = refreshAll;
document.getElementById("cancelBtn").onclick = () => document.getElementById("recordDialog").close();
document.getElementById("closeViewBtn").onclick = () => document.getElementById("viewDialog").close();
document.getElementById("dictionarySelect").onchange = (e) => {
    state.dict = e.target.value;
    state.selectedId = null;
    state.sortKey = null;
    refreshAll();
};

refreshAll();