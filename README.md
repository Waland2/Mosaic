# Mosaic

Mosaic is an [Obsidian](https://obsidian.md/) plugin that converts text selections into Markdown tables and provides commands to encrypt or decrypt files and folders with a passphrase.


## Installation

### Using BRAT

1. In Obsidian, open **Settings → Community plugins → Browse**.
2. Search for and install **BRAT (Beta Reviewer's Auto-update Tester)**.
3. Open the BRAT settings and click **Add Beta Plugin**.
4. Enter this repository URL:

   ```
   https://github.com/Waland2/Mosaic
   ```
5. Enable Mosaic from the Obsidian plugin settings.

### From Releases

1. Download the latest release from the [Releases](https://github.com/Waland2/Mosaic/releases) page.
2. Extract the archive into your vault’s `.obsidian/plugins/mosaic` folder.
3. Reload Obsidian and enable Mosaic in the community plugins settings.

## Features

* **Insert Table from Selection** - transform selected text into a Markdown table.
* **Insert Numbered Table from Selection** - same as above, but automatically adds a row number column.
* **Encrypt File by Key** - encrypt the current file with a passphrase.
* **Decrypt File by Key** - decrypt an encrypted file with the same passphrase.
* **Encrypt Folder by Key** - encrypt all supported text files inside a chosen folder (skips already encrypted).
* **Decrypt Folder by Key** - decrypt all supported text files inside a chosen folder (skips files that are not encrypted or cannot be decrypted).

## Important Information
Obsidian’s **File Recovery** core plugin stores file history in an unencrypted form, even if the files themselves are encrypted with Mosaic.  
For better security, it is strongly recommended to **disable File Recovery** in *Settings → Core plugins* when using Mosaic for encryption.

## License

This project is licensed under the [MIT License](LICENSE.md).
