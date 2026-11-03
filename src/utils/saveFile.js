import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { saveAs } from "file-saver";

// The Android/iOS WebView ignores <a download> and blob: URLs, so exports
// (PDF, CSV, ZIP, receipts) silently did nothing in the app. On native we
// write the file to the app cache and hand it to the system share sheet,
// which offers "Save to Files / Drive / Downloads", email, etc.

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(blob);
  });

const safeName = (name) =>
  String(name || "download").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);

export const saveFile = async (blob, fileName) => {
  if (!Capacitor.isNativePlatform()) {
    saveAs(blob, fileName);
    return;
  }
  const path = safeName(fileName);
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({ path, data, directory: Directory.Cache });
  try {
    await Share.share({ title: path, files: [uri] });
  } catch (err) {
    // Closing the share sheet without choosing a target rejects; not an error.
    if (!/cancel/i.test(err?.message || "")) throw err;
  }
};
