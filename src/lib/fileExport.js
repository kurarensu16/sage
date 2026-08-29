import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

/**
 * Universal file saver & share handler for SAGE.
 * On Native (Android/iOS): Saves to cache and invokes native Share Sheet.
 * On Web: Triggers standard browser download prompt.
 *
 * @param {string} base64Data - Raw base64 string or data URL
 * @param {string} fileName - Destination file name (e.g. 'Grade_Report.pdf')
 * @param {string} mimeType - MIME type (e.g. 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 */
export const saveAndShareFile = async (base64Data, fileName, mimeType = 'application/pdf') => {
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

  if (Capacitor.isNativePlatform()) {
    try {
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: cleanBase64,
        directory: Directory.Cache,
      });

      await Share.share({
        title: fileName,
        url: savedFile.uri,
        dialogTitle: `Share ${fileName}`,
      });
      return { success: true, uri: savedFile.uri };
    } catch (err) {
      console.error('Failed to share file on native platform:', err);
      throw err;
    }
  } else {
    // Web browser direct download
    const blob = b64toBlob(cleanBase64, mimeType);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true };
  }
};

const b64toBlob = (b64Data, contentType = '', sliceSize = 512) => {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
};

export default saveAndShareFile;
