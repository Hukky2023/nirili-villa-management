param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$DataFile
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class NiriliRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 di);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void Send(string printerName, byte[] bytes)
    {
        if (String.IsNullOrWhiteSpace(printerName))
            throw new ArgumentException("Printer name is required.");
        if (bytes == null || bytes.Length == 0)
            throw new ArgumentException("Print data is empty.");

        IntPtr printer = IntPtr.Zero;
        IntPtr unmanaged = IntPtr.Zero;
        bool docStarted = false;
        bool pageStarted = false;

        try
        {
            if (!OpenPrinter(printerName, out printer, IntPtr.Zero))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not open Windows printer.");

            DOC_INFO_1 info = new DOC_INFO_1
            {
                pDocName = "Nirili POS",
                pOutputFile = null,
                pDataType = "RAW"
            };

            if (StartDocPrinter(printer, 1, ref info) == 0)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not start raw print job.");
            docStarted = true;

            if (!StartPagePrinter(printer))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not start printer page.");
            pageStarted = true;

            unmanaged = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, unmanaged, bytes.Length);

            int written;
            if (!WritePrinter(printer, unmanaged, bytes.Length, out written))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not send data to the printer.");
            if (written != bytes.Length)
                throw new InvalidOperationException("Only " + written + " of " + bytes.Length + " printer bytes were sent.");
        }
        finally
        {
            if (unmanaged != IntPtr.Zero) Marshal.FreeCoTaskMem(unmanaged);
            if (pageStarted) EndPagePrinter(printer);
            if (docStarted) EndDocPrinter(printer);
            if (printer != IntPtr.Zero) ClosePrinter(printer);
        }
    }
}
"@

if (-not (Test-Path -LiteralPath $DataFile)) {
    throw "Raw printer data file was not found."
}

$data = [System.IO.File]::ReadAllBytes($DataFile)
[NiriliRawPrinter]::Send($PrinterName, $data)
