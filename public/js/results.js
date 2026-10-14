import { state } from './state.js';
import { addTab } from './tabs.js';
import { getCurrentStatementAtCursor } from './query.js';
import { escapeHtml, escapeHtmlAttribute } from './utils.js';
import { getActiveConnection } from './connections.js';

export function renderResults() {
    const resContainer = document.getElementById('resultsContainer');
    const keyword = document.getElementById('filterInput').value.trim().toLowerCase();

    if (!state.currentData || state.currentData.length === 0) {
        state.filteredData = [];
        resContainer.innerHTML = '<div style="color: #888; text-align: center; margin-top: 50px;">Không tìm thấy bản ghi phù hợp.</div>';
        return;
    }

    if (keyword) {
        state.filteredData = state.currentData.filter(row => {
            return Object.values(row).some(val => 
                val !== null && val !== undefined && String(val).toLowerCase().includes(keyword)
            );
        });
    } else {
        state.filteredData = [...state.currentData];
    }

    if (state.filteredData.length === 0) {
        resContainer.innerHTML = `<div style="color: #f88080; text-align: center; margin-top: 50px;">Không tìm thấy kết quả phù hợp với từ khóa: "<b>${escapeHtml(keyword)}</b>"</div>`;
        return;
    }

    if (state.viewMode === 'JSON') {
        resContainer.innerHTML = `<pre style="color: #9cdcfe; font-size: 13px; margin: 0;">${escapeHtml(JSON.stringify(state.filteredData, null, 2))}</pre>`;
        return;
    }

    const columns = Object.keys(state.filteredData[0]);
    let html = '<table><thead><tr><th class="stt-col">STT</th>';
    columns.forEach(col => html += `<th>${escapeHtml(col)}</th>`);
    html += '</tr></thead><tbody>';

    const startStt = (state.currentPage - 1) * state.PAGE_SIZE;
    state.filteredData.forEach((row, idx) => {
        html += `<tr><td class="stt-col">${startStt + idx + 1}</td>`;
        columns.forEach(col => {
            const val = row[col];
            const displayVal = val !== undefined && val !== null ? (typeof val === 'object' ? JSON.stringify(val) : val) : '';
            // Gán sự kiện nhấp đúp để chỉnh sửa trực tiếp
            html += `<td title="Nhấp đúp chuột để chỉnh sửa giá trị này" data-action="editCell" data-row-index="${idx}" data-column="${escapeHtmlAttribute(col)}">${escapeHtml(displayVal)}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    resContainer.innerHTML = html;
}
// 2. Chuyển ô dữ liệu thành ô Input cho phép sửa

export function makeCellEditable(tdElement, rowIdx, colName) {
    // Tránh việc kích hoạt lại khi ô đang ở trạng thái sửa
    if (tdElement.querySelector('input')) return;

    const oldValue = state.filteredData[rowIdx][colName] !== undefined && state.filteredData[rowIdx][colName] !== null 
        ? String(state.filteredData[rowIdx][colName]) 
        : '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = oldValue;

    tdElement.innerHTML = '';
    tdElement.appendChild(input);
    input.focus();
    input.select();

    // Xử lý khi nhấn Enter (Xác nhận) hoặc Escape (Hủy)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishCellEditing(tdElement, rowIdx, colName, input.value.trim(), oldValue);
        } else if (e.key === 'Escape') {
            tdElement.textContent = oldValue;
        }
    });

    // Tự động xác nhận khi click ra ngoài (Blur)
    input.addEventListener('blur', () => {
        finishCellEditing(tdElement, rowIdx, colName, input.value.trim(), oldValue);
    });
}

// 3. Hoàn tất chỉnh sửa và tự động sinh câu lệnh UPDATE
// Hoàn tất chỉnh sửa ô và tự động sinh câu lệnh UPDATE thông minh

export function finishCellEditing(tdElement, rowIdx, colName, newValue, oldValue) {
    tdElement.textContent = newValue;

    // Nếu giá trị không thay đổi thì bỏ qua
    if (newValue === oldValue) return;

    // Cập nhật giá trị mới vào mảng dữ liệu tạm thời
    state.filteredData[rowIdx][colName] = newValue;

    // Lấy tên bảng từ câu lệnh SELECT hiện tại
    const currentSql = state.editor.getValue();
    const fromMatch = currentSql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    const tableName = fromMatch && fromMatch[1] ? fromMatch[1].toLowerCase() : 'workorder';

    const rowData = state.filteredData[rowIdx];
    const rowKeys = Object.keys(rowData);
    const whereConditions = [];

    // 1. Tìm cột Primary Key chuẩn của Maximo (VD: WORKORDERID, ASSETID, LOCATIONID, LABTRANSID...)
    const expectedPkName = `${tableName}id`.toUpperCase();
    const primaryKeyCol = rowKeys.find(key => {
        const upperKey = key.toUpperCase();
        return upperKey === expectedPkName || upperKey === 'ID' || upperKey === `${tableName}_ID`.toUpperCase();
    });

    // 2. Nếu tìm thấy Primary Key và có giá trị hợp lệ -> Dùng duy nhất Primary Key cho WHERE
    if (primaryKeyCol && rowData[primaryKeyCol] !== null && rowData[primaryKeyCol] !== undefined && rowData[primaryKeyCol] !== '') {
        const pkVal = String(rowData[primaryKeyCol]).replace(/'/g, "''");
        whereConditions.push(`${primaryKeyCol} = '${pkVal}'`);
    } else {
        // 3. Phương án dự phòng: Nếu không có PK (do SELECT không lấy cột ID), ghép các cột còn lại ngoại trừ cột vừa sửa
        rowKeys.forEach(key => {
            if (key !== colName && rowData[key] !== null && rowData[key] !== undefined && rowData[key] !== '') {
                const val = String(rowData[key]).replace(/'/g, "''");
                whereConditions.push(`${key} = '${val}'`);
            }
        });
    }

    // Ghép câu lệnh UPDATE hoàn chỉnh
    const updateSql = `UPDATE ${tableName}\nSET ${colName} = '${newValue.replace(/'/g, "''")}'\nWHERE ${whereConditions.join('\n  AND ')}`;

    // Tự động thêm Tab mới chứa câu lệnh UPDATE
    addTab(updateSql);

    // Hiển thị thông báo
    const msgBox = document.getElementById('msgBox');
    if (msgBox) {
        msgBox.className = 'msg-box success';
        msgBox.style.display = 'block';
        msgBox.innerText = `✏️ Đã sinh câu lệnh UPDATE cho cột [${colName.toUpperCase()}]. Kiểm tra lại và bấm "Chạy" để thực thi.`;
    }
}

export function toggleView() {
    state.viewMode = state.viewMode === 'TABLE' ? 'JSON' : 'TABLE';
    renderResults();
}

// Xuất Excel đa Sheet (Sheet 1: Dữ liệu | Sheet 2: SQL Query & Metadata)

export async function exportExcel() {
    const dataToExport = state.filteredData;
    if (!dataToExport || dataToExport.length === 0) {
        alert('Không có dữ liệu để xuất Excel!');
        return;
    }

    const exportButton = document.getElementById('btn-export');
    const originalLabel = exportButton?.innerText;
    if (exportButton) {
        exportButton.disabled = true;
        exportButton.innerText = '⏳ Đang xuất...';
    }
    try {
    const XLSX = await loadXlsxLibrary();
    const wb = XLSX.utils.book_new();

    // 1. Tạo Sheet 1: Dữ liệu kết quả truy vấn
    const wsData = XLSX.utils.json_to_sheet(dataToExport);
    XLSX.utils.book_append_sheet(wb, wsData, "Data");

    // 2. Tạo Sheet 2: Lưu câu lệnh SQL và thông tin lịch sử xuất
    const sqlText = state.lastExecutedSql || getCurrentStatementAtCursor(state.editor) || state.editor.getValue();
    const queryMeta = [
        { "Thông số": "Thời gian xuất", "Nội dung": new Date().toLocaleString('vi-VN') },
        { "Thông số": "Trang hiện tại", "Nội dung": state.currentPage },
        { "Thông số": "Số bản ghi xuất", "Nội dung": dataToExport.length },
        { "Thông số": "Môi trường Host", "Nội dung": getActiveConnection()?.host || 'N/A' },
        { "Thông số": "Câu lệnh SQL", "Nội dung": sqlText }
    ];

    const wsQuery = XLSX.utils.json_to_sheet(queryMeta);

    // Chỉnh độ rộng cột Sheet 2 giúp hiển thị câu SQL dài dễ đọc hơn
    wsQuery['!cols'] = [
        { wch: 20 }, // Độ rộng cột Thông số
        { wch: 120 } // Độ rộng cột Nội dung SQL
    ];

    XLSX.utils.book_append_sheet(wb, wsQuery, "SQL_Info");

    // 3. Tiến hành xuất tập tin Excel (.xlsx)
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Maximo_Export_${dateStr}_Page${state.currentPage}.xlsx`;
    const fileBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    const fileBlob = new Blob([fileBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const downloadUrl = URL.createObjectURL(fileBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = fileName;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    const msgBox = document.getElementById('msgBox');
    msgBox.className = 'msg-box success';
    msgBox.style.display = 'block';
    msgBox.innerText = `✅ Đã xuất ${dataToExport.length} bản ghi của trang hiện tại. Kiểm tra thư mục Tải xuống: ${fileName}`;
    } catch (error) {
        alert('Không thể xuất Excel: ' + error.message);
    } finally {
        if (exportButton) {
            exportButton.disabled = false;
            exportButton.innerText = originalLabel;
        }
    }
}


export function loadXlsxLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!state.xlsxLoadPromise) {
        state.xlsxLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = './vendor/xlsx/xlsx.full.min.js';
            script.onload = () => resolve(window.XLSX);
            script.onerror = () => {
                state.xlsxLoadPromise = null;
                reject(new Error('Không tải được thư viện Excel.'));
            };
            document.head.appendChild(script);
        });
    }
    return state.xlsxLoadPromise;
}

// Chuyển Tab Sidebar
