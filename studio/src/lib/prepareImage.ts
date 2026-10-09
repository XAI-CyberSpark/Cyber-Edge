/** Shared upload preparation for simulation and standalone model tests. */
const MB = 1024 * 1024;
export const IMAGE_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
const MAX_INPUT_BYTES = 25 * MB;
const MAX_OUTPUT_BYTES = 4 * MB;
const MAX_EDGE = 2560;

async function imageFormat(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const ascii = String.fromCharCode(...bytes);
  if (ascii.startsWith('RIFF') && ascii.slice(8) === 'WEBP') return 'image/webp';
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) throw new Error('暂不支持 HEIC/HEIF 图片，请先导出为 JPG、PNG 或 WebP。');
  throw new Error('图片格式不支持，请选择 PNG、JPG 或 WebP。');
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file: File): Promise<{ url: string; name: string }> {
  if (!file.size) throw new Error('这张图片是空文件，请重新选择。');
  if (file.size > MAX_INPUT_BYTES) throw new Error('原图超过 25 MB，请选择较小的图片；25 MB 以内的大图会自动压缩。');
  const format = await imageFormat(file);
  const original = file.slice(0, file.size, format); // Missing/incorrect OS MIME does not reject a valid image.
  const objectUrl = URL.createObjectURL(original);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('图片读取超时，请重新选择。')), 20000);
      image.onload = () => { window.clearTimeout(timer); resolve(); };
      image.onerror = () => { window.clearTimeout(timer); reject(new Error('图片无法解码，文件可能已损坏，请重新选择。')); };
      image.src = objectUrl;
    });
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) throw new Error('图片尺寸无效，请重新选择。');
    if (width * height > 80_000_000) throw new Error('图片像素过大（超过 8000 万像素），请先缩小尺寸再上传。');
    if (Math.max(width, height) <= MAX_EDGE && original.size <= MAX_OUTPUT_BYTES) {
      return { url: await dataUrl(original), name: file.name };
    }
    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理图片，请更换浏览器重试。');
    let scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    for (let sizeAttempt = 0; sizeAttempt < 4; sizeAttempt++) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.9, .8, .7]) {
        const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(result => result ? resolve(result) : reject(new Error('图片压缩失败，请重新选择。')), 'image/jpeg', quality));
        if (blob.size <= MAX_OUTPUT_BYTES) return { url: await dataUrl(blob), name: file.name };
      }
      scale *= .75;
    }
    throw new Error('图片自动压缩后仍然过大，请换一张图片。');
  } finally {
    image.onload = null; image.onerror = null; image.src = '';
    URL.revokeObjectURL(objectUrl);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
