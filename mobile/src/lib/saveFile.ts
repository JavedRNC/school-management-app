import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const KEY_FOLDER = 'save_folder';
// Android's own folder picker opens here; "Documents" can be chosen directly ("Download" itself can't on Android 11+).
const START_AT = 'content://com.android.externalstorage.documents/document/primary%3ADocuments';

export type FileKind = { mime: string; uti: string };
export const XLSX_FILE: FileKind = { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uti: 'org.openxmlformats.spreadsheetml.sheet' };
export const CSV_FILE: FileKind = { mime: 'text/csv', uti: 'public.comma-separated-values-text' };
export const PDF_FILE: FileKind = { mime: 'application/pdf', uti: 'com.adobe.pdf' };

export type Saved = {
  /** Folder name the file was saved into; null when the share sheet was used instead (iPhone). */
  folder: string | null;
  share: () => Promise<void>;
};

/** "content://…/tree/primary%3ADocuments%2FSchool" → "Documents/School" */
function folderName(uri: string): string {
  try {
    const last = decodeURIComponent(uri.split('/tree/')[1] ?? '').split(':').pop() ?? '';
    return last || 'your phone';
  } catch {
    return 'your phone';
  }
}

export async function shareFile(uri: string, kind: FileKind, title: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone');
  await Sharing.shareAsync(uri, { mimeType: kind.mime, dialogTitle: title, UTI: kind.uti });
}

async function pickFolder(): Promise<string> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync(START_AT);
  } catch {
    throw new Error('Not saved — choose a folder (for example Documents) and tap "Use this folder"');
  }
  await AsyncStorage.setItem(KEY_FOLDER, dir.uri);
  return dir.uri;
}

/**
 * Save a file from the app's cache straight into a folder on the phone (Android).
 * The first time, Android asks which folder to use; it is remembered after that.
 * iPhone has no such folder, so the share sheet ("Save to Files") opens instead.
 */
export async function saveToPhone(uri: string, name: string, kind: FileKind, title: string): Promise<Saved> {
  const share = () => shareFile(uri, kind, title);
  if (Platform.OS !== 'android') {
    await share();
    return { folder: null, share };
  }
  const bytes = await new File(uri).bytes();
  const write = async (folder: string) => {
    const out = new Directory(folder).createFile(name, kind.mime);
    await out.write(bytes);
  };
  let folder = await AsyncStorage.getItem(KEY_FOLDER).catch(() => null);
  if (folder) {
    try {
      await write(folder);
      return { folder: folderName(folder), share };
    } catch {
      // Folder deleted or permission taken away: ask again.
      await AsyncStorage.removeItem(KEY_FOLDER).catch(() => {});
    }
  }
  folder = await pickFolder();
  try {
    await write(folder);
  } catch {
    // This phone won't let the app write there: don't leave the user stuck, open the share sheet.
    await AsyncStorage.removeItem(KEY_FOLDER).catch(() => {});
    await share();
    return { folder: null, share };
  }
  return { folder: folderName(folder), share };
}

/** Toast text + Share action for a finished save. */
export function savedToast(s: Saved, what: string, onError: (m: string) => void) {
  if (!s.folder) return { text: `${what} ready`, opts: undefined };
  return {
    text: `${what} saved in ${s.folder}`,
    opts: { action: { label: 'Share', onPress: () => { s.share().catch((e) => onError((e as Error).message)); } } },
  };
}
