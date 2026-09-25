# Nirili POS Desktop (Windows)

This desktop application opens the live Nirili Villa Restaurant POS and connects it to Windows receipt-printer hardware without QZ Tray.

## What it does

- Connects to the online Nirili Villa management/POS system.
- Uses the same online accounts, rooms, restaurant bills and kitchen workflow.
- Lists printers installed in Windows.
- Sends 58 mm ESC/POS receipt data directly through the Windows print spooler.
- Opens the cash drawer through the selected receipt printer using the ESC/POS drawer pulse.
- Keeps the browser/web version available as a backup.

## Default server

The desktop app opens:

https://www.nirilihotels.com/restaurant

The URL can be changed with the environment variable `NIRILI_POS_URL`, the command-line option `--server=https://...`, or by editing `config.json` in the app data folder.

## Cash drawer wiring

Connect the cash drawer to the receipt printer's DK/RJ11/RJ12 drawer port, not directly to the PC. The desktop app sends the drawer pulse through the Windows receipt printer.

## Windows setup

1. Install the receipt printer's normal Windows driver.
2. Connect the printer by USB or LAN and confirm Windows can see it.
3. Install Nirili POS.
4. Open **Printer** in the POS.
5. Press **Refresh Windows printers**.
6. Select the receipt printer.
7. Print a test receipt and save.
8. Test the separate **Open drawer** button.

QZ Tray is not required in Nirili POS Desktop.
