const DEFAULT_STATE = Object.freeze({
  content: "",
  size: 320,
  margin: 8,
  errorCorrection: "H",
  foreground: "#111827",
  background: "#ffffff",
  logoDataUrl: "",
  logoSize: 18,
});

const LIMITS = Object.freeze({
  minSize: 128,
  maxSize: 1000,
  minMargin: 0,
  maxMargin: 32,
  minLogo: 8,
  maxLogo: 28,
  maxPreviewSize: 420,
});

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
]);

const state = { ...DEFAULT_STATE };
const dom = {
  content: document.getElementById("content"),
  size: document.getElementById("size"),
  margin: document.getElementById("margin"),
  foreground: document.getElementById("foreground"),
  background: document.getElementById("background"),
  logoFile: document.getElementById("logoFile"),
  logoSize: document.getElementById("logoSize"),
  logoSizeOutput: document.getElementById("logoSizeOutput"),
  removeLogo: document.getElementById("removeLogo"),
  downloadPngBtn: document.getElementById("downloadPngBtn"),
  downloadSvgBtn: document.getElementById("downloadSvgBtn"),
  resetBtn: document.getElementById("resetBtn"),
  feedback: document.getElementById("feedback"),
  previewMeta: document.getElementById("previewMeta"),
  qrPreview: document.getElementById("qrPreview"),
  qrRenderMount: document.getElementById("qrRenderMount"),
  qrDisplayCanvas: document.getElementById("qrDisplayCanvas"),
};

let qrCode = null;
let hasSuccessfulRender = false;
let autoRenderTimer = null;
let previewToken = 0;
let cachedLogoImage = null;
let cachedLogoSrc = "";

init();

function init() {
  setFeedback("Ievadi saturu, lai ģenerētu QR kodu.");
  setDownloadEnabled(false);
  syncUIFromState();
  bindEvents();
}

function bindEvents() {
  dom.size.addEventListener("input", handleNumericInput);
  dom.margin.addEventListener("input", handleNumericInput);
  dom.size.addEventListener("blur", handleNumericCommit);
  dom.margin.addEventListener("blur", handleNumericCommit);

  dom.foreground.addEventListener("input", handleFieldChange);
  dom.background.addEventListener("input", handleFieldChange);
  dom.content.addEventListener("input", handleFieldChange);
  dom.logoSize.addEventListener("input", () => {
    dom.logoSizeOutput.textContent = `${dom.logoSize.value}%`;
    updateStateFromInputs();
    scheduleAutoRender();
  });
  dom.logoSize.addEventListener("change", () => {
    updateStateFromInputs();
    renderQr(false);
  });

  dom.logoFile.addEventListener("change", handleLogoUpload);
  dom.removeLogo.addEventListener("click", removeLogo);
  dom.downloadPngBtn.addEventListener("click", () => downloadQr("png"));
  dom.downloadSvgBtn.addEventListener("click", () => downloadQr("svg"));
  dom.resetBtn.addEventListener("click", resetForm);
}

function handleFieldChange() {
  updateStateFromInputs();
  renderQr(false);
}

function handleNumericInput() {
  updateStateFromInputs();
  scheduleAutoRender();
}

function handleNumericCommit() {
  updateStateFromInputs();
  normalizeNumericInputs();
  renderQr(false);
}

function scheduleAutoRender() {
  clearTimeout(autoRenderTimer);
  autoRenderTimer = setTimeout(() => {
    renderQr(false);
  }, 120);
}

function syncUIFromState() {
  dom.content.value = state.content;
  dom.size.value = state.size;
  dom.margin.value = state.margin;
  dom.foreground.value = state.foreground;
  dom.background.value = state.background;
  dom.logoSize.value = state.logoSize;
  dom.logoSizeOutput.textContent = `${state.logoSize}%`;
  setCanvasSize();
}

function updateStateFromInputs() {
  state.content = dom.content.value.trim();
  state.size = readBoundedNumber(dom.size.value, state.size, LIMITS.minSize, LIMITS.maxSize, DEFAULT_STATE.size);
  state.margin = readBoundedNumber(dom.margin.value, state.margin, LIMITS.minMargin, LIMITS.maxMargin, DEFAULT_STATE.margin);
  state.errorCorrection = "H";
  state.foreground = dom.foreground.value || DEFAULT_STATE.foreground;
  state.background = dom.background.value || DEFAULT_STATE.background;
  state.logoSize = readBoundedNumber(dom.logoSize.value, state.logoSize, LIMITS.minLogo, LIMITS.maxLogo, DEFAULT_STATE.logoSize);

  dom.logoSizeOutput.textContent = `${state.logoSize}%`;
}

function normalizeNumericInputs() {
  dom.size.value = String(state.size);
  dom.margin.value = String(state.margin);
  dom.logoSize.value = String(state.logoSize);
}

async function handleLogoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    event.target.value = "";
    setFeedback("Atbalstītie logo formāti: PNG, JPG, SVG, WEBP.", "error");
    return;
  }

  try {
    state.logoDataUrl = await readFileAsDataUrl(file);
    setFeedback("Logo pievienots.");
    renderQr(false);
  } catch (_error) {
    setFeedback("Neizdevās nolasīt logo failu. Mēģini citu failu.", "error");
  }
}

function removeLogo() {
  state.logoDataUrl = "";
  dom.logoFile.value = "";
  setFeedback("Logo noņemts.");
  renderQr(false);
}

function renderQr(isManualSubmit) {
  const validation = validateState();
  if (!validation.valid) {
    hasSuccessfulRender = false;
    setDownloadEnabled(false);
    setFeedback(validation.message, "error");
    return;
  }

  setCanvasSize();
  const options = buildQrOptions();

  try {
    if (!qrCode) {
      qrCode = new QRCodeStyling(options);
      dom.qrRenderMount.innerHTML = "";
      qrCode.append(dom.qrRenderMount);
    } else {
      qrCode.update(options);
    }

    syncMountedQrSize();
    hasSuccessfulRender = true;
    setDownloadEnabled(true);
    const currentToken = ++previewToken;
    drawFixedPreview(currentToken).catch(() => {});
    if (isManualSubmit) {
      setFeedback("QR kods veiksmīgi atjaunināts.");
    } else {
      setFeedback("QR priekšskatījums atjaunināts.");
    }
  } catch (_error) {
    hasSuccessfulRender = false;
    setDownloadEnabled(false);
    setFeedback("Neizdevās ģenerēt QR kodu. Pārbaudi satura garumu un parametrus, tad mēģini vēlreiz.", "error");
  }
}

function validateState() {
  if (!state.content) {
    return {
      valid: false,
      message: "Lūdzu ievadi saturu (tekstu vai URL), lai ģenerētu QR kodu.",
    };
  }

  return { valid: true, message: "" };
}

function buildQrOptions() {
  return {
    width: state.size,
    height: state.size,
    type: "svg",
    data: state.content,
    margin: 0,
    qrOptions: {
      errorCorrectionLevel: state.errorCorrection,
      margin: 0,
    },
    dotsOptions: {
      color: state.foreground,
      type: "square",
    },
    backgroundOptions: {
      color: state.background,
    },
  };
}

async function downloadQr(extension) {
  if (!qrCode || !hasSuccessfulRender) {
    setFeedback("Vispirms veiksmīgi ģenerē QR kodu.", "error");
    return;
  }

  try {
    const rawBlob = await qrCode.getRawData(extension);
    if (!rawBlob) {
      throw new Error("Raw data missing");
    }

    const finalBlob = await addFrameToBlob(rawBlob, extension);
    triggerBlobDownload(finalBlob, `qr-kods.${extension}`);
    setFeedback(`Lejupielāde sākta (${extension.toUpperCase()}).`);
  } catch (_error) {
    setFeedback("Lejupielāde neizdevās. Mēģini vēlreiz.", "error");
  }
}

function resetForm() {
  Object.assign(state, DEFAULT_STATE);
  syncUIFromState();
  dom.logoFile.value = "";
  hasSuccessfulRender = false;
  setDownloadEnabled(false);
  dom.qrRenderMount.innerHTML = "";
  qrCode = null;
  disableCanvasPreview();
  clearDisplayCanvas();
  setFeedback("Forma atiestatīta. Ievadi saturu, lai sāktu no jauna.");
}

function setCanvasSize() {
  const totalSize = state.size + state.margin * 2;
  const previewScale = getPreviewScale(totalSize);
  dom.qrDisplayCanvas.style.width = `${Math.round(totalSize * previewScale)}px`;
  dom.qrDisplayCanvas.style.height = `${Math.round(totalSize * previewScale)}px`;
  updatePreviewMeta(totalSize, previewScale);
}

function syncMountedQrSize() {
  const renderedNode = dom.qrRenderMount.querySelector("canvas,svg,img");
  if (!renderedNode) {
    return;
  }

  renderedNode.style.width = `${state.size}px`;
  renderedNode.style.height = `${state.size}px`;
  const previewScale = getPreviewScale(state.size + state.margin * 2);
  renderedNode.style.maxWidth = `${Math.round((state.size + state.margin * 2) * previewScale)}px`;
  dom.qrRenderMount.style.padding = `${state.margin}px`;
  dom.qrRenderMount.style.backgroundColor = state.background;
}

async function addFrameToBlob(blob, extension) {
  const needsComposition = state.margin > 0 || Boolean(state.logoDataUrl);

  if (!needsComposition) {
    return blob;
  }

  if (extension === "png") {
    return addFrameToPng(blob);
  }

  if (extension === "svg") {
    return addFrameToSvg(blob);
  }

  return blob;
}

async function addFrameToPng(blob) {
  const totalSize = state.size + state.margin * 2;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = totalSize;
  canvas.height = totalSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context missing");
  }

  context.fillStyle = state.background;
  context.fillRect(0, 0, totalSize, totalSize);
  context.drawImage(bitmap, state.margin, state.margin, state.size, state.size);
  bitmap.close();
  await drawLogoOverlay(context);

  const framedBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
        return;
      }
      reject(new Error("PNG compose failed"));
    }, "image/png");
  });

  return framedBlob;
}

async function addFrameToSvg(blob) {
  const rawSvg = await blob.text();
  const totalSize = state.size + state.margin * 2;
  const encoded = window.btoa(unescape(encodeURIComponent(rawSvg)));
  const logoMarkup = getSvgLogoMarkup();
  const wrapped = `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">
  <rect x="0" y="0" width="${totalSize}" height="${totalSize}" fill="${state.background}" />
  <image href="data:image/svg+xml;base64,${encoded}" x="${state.margin}" y="${state.margin}" width="${state.size}" height="${state.size}" />
  ${logoMarkup}
</svg>`;

  return new Blob([wrapped], { type: "image/svg+xml;charset=utf-8" });
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function drawFixedPreview(token) {
  if (!qrCode) {
    return;
  }

  await nextAnimationFrame();
  if (token !== previewToken) {
    return;
  }

  const svgElement = dom.qrRenderMount.querySelector("svg");
  if (!svgElement) {
    throw new Error("Rendered SVG not found");
  }

  const svgBlob = createSvgBlobFromElement(svgElement);
  const bitmap = await createBitmapFromBlob(svgBlob);
  if (!bitmap || token !== previewToken) {
    closeBitmap(bitmap);
    return;
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = bitmap.width;
  sourceCanvas.height = bitmap.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) {
    closeBitmap(bitmap);
    throw new Error("No source context");
  }

  sourceContext.drawImage(bitmap, 0, 0);
  closeBitmap(bitmap);

  const bounds = detectContentBounds(sourceCanvas, state.background);
  await renderToDisplayCanvas(sourceCanvas, bounds);
  enableCanvasPreview();
}

async function renderToDisplayCanvas(sourceCanvas, bounds) {
  const totalSize = state.size + state.margin * 2;
  const dpr = window.devicePixelRatio || 1;
  const canvas = dom.qrDisplayCanvas;
  canvas.width = Math.round(totalSize * dpr);
  canvas.height = Math.round(totalSize * dpr);
  canvas.style.width = `${totalSize}px`;
  canvas.style.height = `${totalSize}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No display context");
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, totalSize, totalSize);
  ctx.fillStyle = state.background;
  ctx.fillRect(0, 0, totalSize, totalSize);
  ctx.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    state.margin,
    state.margin,
    state.size,
    state.size
  );
  await drawLogoOverlay(ctx);
}

function detectContentBounds(canvas, backgroundHex) {
  const context = canvas.getContext("2d");
  if (!context) {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const bg = hexToRgb(backgroundHex);
  const threshold = 7;
  const alphaThreshold = 16;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      // Treat transparent pixels as background so the preview crop
      // removes the QR library's internal quiet zone instead of keeping it.
      if (a <= alphaThreshold) {
        continue;
      }

      if (!isCloseToBackground(r, g, b, bg, threshold)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function isCloseToBackground(r, g, b, bg, threshold) {
  return (
    Math.abs(r - bg.r) <= threshold &&
    Math.abs(g - bg.g) <= threshold &&
    Math.abs(b - bg.b) <= threshold
  );
}

function hexToRgb(hex) {
  const normalized = (hex || "#ffffff").replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const numeric = Number.parseInt(expanded, 16);
  if (!Number.isFinite(numeric)) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function enableCanvasPreview() {
  dom.qrPreview.classList.add("qr-canvas-ready");
}

function disableCanvasPreview() {
  dom.qrPreview.classList.remove("qr-canvas-ready");
}

function clearDisplayCanvas() {
  const canvas = dom.qrDisplayCanvas;
  const totalSize = state.size + state.margin * 2;
  canvas.width = totalSize;
  canvas.height = totalSize;
  canvas.style.width = `${totalSize}px`;
  canvas.style.height = `${totalSize}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, totalSize, totalSize);
  ctx.fillStyle = state.background;
  ctx.fillRect(0, 0, totalSize, totalSize);
}

function getPreviewScale(totalSize) {
  if (totalSize <= LIMITS.maxPreviewSize) {
    return 1;
  }
  return LIMITS.maxPreviewSize / totalSize;
}

function updatePreviewMeta(totalSize, previewScale) {
  const scaledSize = Math.round(totalSize * previewScale);
  if (previewScale >= 0.999) {
    dom.previewMeta.textContent = `Priekšskatījums 1:1. Eksporta izmērs: ${totalSize}px.`;
    return;
  }

  dom.previewMeta.textContent =
    `Eksporta izmērs: ${totalSize}px. Priekšskatījums samazināts līdz ${scaledSize}px (${Math.round(previewScale * 100)}%).`;
}

function createSvgBlobFromElement(svgElement) {
  const clone = svgElement.cloneNode(true);
  clone.setAttribute("width", String(state.size));
  clone.setAttribute("height", String(state.size));
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${state.size} ${state.size}`);
  }
  const svgMarkup = new XMLSerializer().serializeToString(clone);
  return new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
}

async function createBitmapFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function closeBitmap(bitmap) {
  if (bitmap && typeof bitmap.close === "function") {
    bitmap.close();
  }
}

async function drawLogoOverlay(context) {
  if (!state.logoDataUrl) {
    return;
  }

  const logoImage = await loadLogoImage();
  if (!logoImage) {
    return;
  }

  const layout = getLogoLayout();
  drawRoundedRect(context, layout.boxX, layout.boxY, layout.boxSize, layout.boxSize, layout.radius);
  context.fillStyle = state.background;
  context.fill();

  const containRect = fitContainRect(
    logoImage.naturalWidth || logoImage.width || layout.imageSize,
    logoImage.naturalHeight || logoImage.height || layout.imageSize,
    layout.imageX,
    layout.imageY,
    layout.imageSize,
    layout.imageSize
  );

  context.drawImage(logoImage, containRect.x, containRect.y, containRect.width, containRect.height);
}

function getLogoLayout() {
  const logoPixels = Math.round((state.size * state.logoSize) / 100);
  const padding = Math.max(2, Math.round(logoPixels * 0.08));
  const boxSize = logoPixels + padding * 2;
  const boxX = state.margin + Math.round((state.size - boxSize) / 2);
  const boxY = state.margin + Math.round((state.size - boxSize) / 2);
  return {
    boxX,
    boxY,
    boxSize,
    imageX: boxX + padding,
    imageY: boxY + padding,
    imageSize: logoPixels,
    radius: Math.max(4, Math.round(boxSize * 0.14)),
  };
}

function fitContainRect(sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight) {
  if (!sourceWidth || !sourceHeight) {
    return {
      x: targetX,
      y: targetY,
      width: targetWidth,
      height: targetHeight,
    };
  }

  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: targetX + (targetWidth - width) / 2,
    y: targetY + (targetHeight - height) / 2,
    width,
    height,
  };
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

async function loadLogoImage() {
  if (!state.logoDataUrl) {
    return null;
  }

  if (cachedLogoSrc === state.logoDataUrl && cachedLogoImage) {
    return cachedLogoImage;
  }

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Logo load failed"));
    img.src = state.logoDataUrl;
  });

  cachedLogoSrc = state.logoDataUrl;
  cachedLogoImage = image;
  return image;
}

function getSvgLogoMarkup() {
  if (!state.logoDataUrl) {
    return "";
  }

  const layout = getLogoLayout();
  const href = escapeXmlAttribute(state.logoDataUrl);
  return `
  <rect x="${layout.boxX}" y="${layout.boxY}" width="${layout.boxSize}" height="${layout.boxSize}" rx="${layout.radius}" ry="${layout.radius}" fill="${state.background}" />
  <image href="${href}" x="${layout.imageX}" y="${layout.imageY}" width="${layout.imageSize}" height="${layout.imageSize}" preserveAspectRatio="xMidYMid meet" />`;
}

function escapeXmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function setDownloadEnabled(enabled) {
  dom.downloadPngBtn.disabled = !enabled;
  dom.downloadSvgBtn.disabled = !enabled;
}

function setFeedback(message, tone = "default") {
  dom.feedback.textContent = message;
  dom.feedback.classList.remove("error", "warning");
  if (tone === "error" || tone === "warning") {
    dom.feedback.classList.add(tone);
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function readBoundedNumber(rawValue, currentValue, min, max, fallback) {
  if (typeof rawValue !== "string") {
    return currentValue;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return currentValue;
  }

  return clampNumber(trimmed, min, max, fallback);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}
