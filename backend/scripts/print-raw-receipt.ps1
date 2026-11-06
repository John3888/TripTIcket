param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$DataPath
)

$ErrorActionPreference = "Stop"

# Exit codes let the API show a short setup message without exposing command output.
try {
  $printer = Get-Printer -ErrorAction Stop | Where-Object { $_.Name -eq $PrinterName }
} catch {
  exit 4
}
if (-not $printer) { exit 2 }

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static bool SendBytes(string printerName, byte[] bytes) {
    IntPtr printerHandle;
    if (!OpenPrinter(printerName.Normalize(), out printerHandle, IntPtr.Zero)) return false;

    DOCINFOA docInfo = new DOCINFOA();
    docInfo.pDocName = "EMB Trip Ticket Receipt";
    docInfo.pDataType = "RAW";

    bool success = false;
    if (StartDocPrinter(printerHandle, 1, docInfo)) {
      if (StartPagePrinter(printerHandle)) {
        IntPtr unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);
        int written;
        success = WritePrinter(printerHandle, unmanagedBytes, bytes.Length, out written) && written == bytes.Length;
        Marshal.FreeCoTaskMem(unmanagedBytes);
        EndPagePrinter(printerHandle);
      }
      EndDocPrinter(printerHandle);
    }
    ClosePrinter(printerHandle);
    return success;
  }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($DataPath)
if (-not [RawPrinterHelper]::SendBytes($PrinterName, $bytes)) {
  exit 3
}
