const views = {
  home: document.getElementById("home-view"),
  process: document.getElementById("process-view"),
  result: document.getElementById("result-view"),
};

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const selectedFilesList = document.getElementById("selected-files-list");
const outputType = document.getElementById("output-type");
const btnConvert = document.getElementById("btn-convert");
const historyList = document.getElementById("history-list");
const resultList = document.getElementById("result-list");
const errorBanner = document.getElementById("error-banner");
const errorCodeSpan = document.getElementById("error-code");

const btnConvertAgain = document.getElementById("btn-convert-again");
const btnShare = document.getElementById("btn-share");
const exportPdfCheck = document.getElementById("export-pdf");

// State Management
let currentFiles = [];
let uploadHistory = []; // Untuk menyimpan riwayat home page
let conversionResults = []; // Untuk menyimpan hasil sementara di result page

// --- VIEW ROUTING ---
function switchView(viewName) {
  Object.values(views).forEach((view) => view.classList.remove("active"));
  views[viewName].classList.add("active");
}

// --- HOME LOGIC (Drag & Drop, Selection) ---
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) {
    handleFilesSelection(e.dataTransfer.files);
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFilesSelection(e.target.files);
  }
});

function handleFilesSelection(files) {
  // Filter hanya .zip
  const validFiles = Array.from(files).filter((file) =>
    file.name.endsWith(".zip"),
  );

  if (validFiles.length > 0) {
    currentFiles = validFiles;
    selectedFilesList.innerHTML = `<strong>Selected:</strong> ${currentFiles.map((f) => f.name).join(", ")}`;
    btnConvert.disabled = false;
  } else {
    alert("Please select valid ZIP files.");
  }
}

// --- CONVERT & PROCESS LOGIC ---
btnConvert.addEventListener("click", () => {
  if (currentFiles.length === 0) return;

  const isExportPdf = exportPdfCheck.checked;
  switchView("process");

  // Panggil fungsi Fetch API yang baru
  sendToServer(currentFiles, outputType.value, isExportPdf);
});

// Fungsi baru untuk mengirim data ke Flask
async function sendToServer(files, format, isExportPdf) {
  // 1. Inisialisasi FormData
  const formData = new FormData();
  formData.append("format", format);
  formData.append("isExportPdf", isExportPdf);

  // 2. Masukkan semua file .zip ke dalam FormData
  files.forEach((file) => {
    formData.append("files", file);
  });

  try {
    // 3. Eksekusi request ke backend Flask
    const response = await fetch(
      "https://webp-batch-converter.onrender.com/api/convert",
      {
        method: "POST",
        body: formData,
        // PENTING: Jangan set header 'Content-Type' manual.
        // Browser akan otomatis men-setnya dengan "boundary" yang tepat untuk FormData.
      },
    );

    const data = await response.json();

    if (response.ok && data.success) {
      console.log("Response dari server:", data);

      const currentDate = new Date().toLocaleString();
      const displayedFormat = isExportPdf ? `${format} & PDF` : format;

      // Catat ke history di halaman Home
      files.forEach((file) => {
        uploadHistory.push({
          name: file.name,
          date: currentDate,
          format: displayedFormat,
        });
      });

      // Gunakan hasil AKTUAL dari backend Flask
      const finalResults = data.results.map((res, index) => ({
        id: Date.now() + index,
        originalName: res.originalName,
        newName: res.newName,
        date: currentDate,
        status: res.status,
        type: displayedFormat,
        url: res.url, // URL asli ke /api/download/<filename>
      }));

      handleAPIResponse({
        success: true,
        errorCode: null,
        results: finalResults,
      });

      renderHistory();
    } else {
      // Server merespons tapi mengembalikan error (misal 400 Bad Request)
      handleAPIResponse({
        success: false,
        errorCode: data.errorCode || `HTTP Error ${response.status}`,
        results: [],
      });
    }
  } catch (error) {
    // Error jaringan (misal server Flask belum dijalankan)
    console.error("Fetch error:", error);
    handleAPIResponse({
      success: false,
      errorCode: "Network Error: Pastikan server Flask berjalan di port 5000.",
      results: [],
    });
  }
}

// --- RESULT LOGIC ---
function handleAPIResponse(response) {
  conversionResults = response.results;

  if (response.errorCode) {
    errorBanner.classList.remove("hidden");
    errorCodeSpan.textContent = response.errorCode;
  } else {
    errorBanner.classList.add("hidden");
  }

  renderResults();
  switchView("result");
}

function renderResults() {
  resultList.innerHTML = "";

  conversionResults.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `
            <div class="item-info">
                <strong>${item.newName}</strong>
                <span class="item-meta">Original: ${item.originalName} | Date: ${item.date} | Format: ${item.type}</span>
                <span class="badge ${item.status.toLowerCase()}">${item.status}</span>
            </div>
            <div class="btn-group">
                ${item.status === "Success" ? `<button class="btn-secondary" onclick="downloadFile('${item.url}')">Download</button>` : ""}
                <button class="btn-danger" onclick="deleteResultItem(${item.id})">Delete</button>
            </div>
        `;
    resultList.appendChild(li);
  });
}

window.downloadFile = function (url) {
  // Membuka URL tab/jendela baru yang akan otomatis memicu download file zip
  window.open(url, "_blank");
};

window.deleteResultItem = function (id) {
  conversionResults = conversionResults.filter((item) => item.id !== id);
  renderResults();
};

function renderHistory() {
  if (uploadHistory.length === 0) return;

  historyList.innerHTML = "";
  // Reverse agar yang terbaru di atas
  [...uploadHistory].reverse().forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `
            <div class="item-info">
                <strong>${item.name}</strong>
                <span class="item-meta">${item.date} - Targeted to ${item.format}</span>
            </div>
        `;
    historyList.appendChild(li);
  });
}

// --- NAVIGATION & SHARE ---
btnShare.addEventListener("click", () => {
  const url = window.location.href;
  navigator.clipboard
    .writeText(url)
    .then(() => {
      alert("Link copied to clipboard!");
    })
    .catch((err) => {
      console.error("Could not copy text: ", err);
    });
});

btnConvertAgain.addEventListener("click", () => {
  // Reset state untuk konversi baru
  currentFiles = [];
  selectedFilesList.innerHTML = "";
  btnConvert.disabled = true;
  fileInput.value = "";
  exportPdfCheck.checked = false; // Reset checkbox PDF

  switchView("home");
});
