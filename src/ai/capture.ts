import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * 拍照 / 选图 → 压缩 → base64 data URL。
 *
 * 压到长边 1024、JPEG 0.7 是权衡后的选择：再大对识别精度几乎无帮助，
 * 但会显著拉长上传时间与 token 消耗（base64 会让字节数再涨约 1/3）。
 */

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.7;

export type CaptureSource = "camera" | "library";

export interface CaptureResult {
  dataUrl: string;
  /** 本地文件 uri，用于在确认页展示缩略图 */
  uri: string;
  width: number;
  height: number;
}

export class CaptureError extends Error {
  readonly kind: "denied" | "cancelled" | "failed";
  constructor(kind: CaptureError["kind"], message: string) {
    super(message);
    this.name = "CaptureError";
    this.kind = kind;
  }
}

async function ensureCameraPermission(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await ImagePicker.requestCameraPermissionsAsync();
  return asked.granted;
}

async function ensureLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return asked.granted;
}

/**
 * 取一张照片。
 *
 * 相机权限被拒时自动降级到相册（并明确告知用户原因），因为很多用户
 * 只是不想给相机权限，但愿意从相册选一张已经拍好的照片。
 */
export async function captureMealPhoto(
  source: CaptureSource,
): Promise<CaptureResult> {
  let useLibrary = source === "library";

  if (!useLibrary) {
    const ok = await ensureCameraPermission();
    if (!ok) useLibrary = true;
  }
  if (useLibrary) {
    const ok = await ensureLibraryPermission();
    if (!ok) {
      throw new CaptureError(
        "denied",
        "没有相册访问权限。可以到系统设置里打开，或直接手动录入这一餐。",
      );
    }
  }

  const result = useLibrary
    ? await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsMultipleSelection: false,
      })
    : await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 1,
        cameraType: ImagePicker.CameraType.back,
      });

  if (result.canceled || !result.assets?.length) {
    throw new CaptureError("cancelled", "已取消");
  }

  const asset = result.assets[0];
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const longEdge = Math.max(width, height);

  const context = ImageManipulator.manipulate(asset.uri);
  if (longEdge > MAX_EDGE) {
    // 只按长边等比缩放，避免拉伸变形
    if (width >= height) context.resize({ width: MAX_EDGE });
    else context.resize({ height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_QUALITY,
    base64: true,
  });

  if (!saved.base64) {
    throw new CaptureError("failed", "照片处理失败，请重试。");
  }

  return {
    dataUrl: `data:image/jpeg;base64,${saved.base64}`,
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
  };
}
