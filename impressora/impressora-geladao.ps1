# =========================================================
#  Impressora Geladão
#  Programinha que fica ligado no computador do caixa.
#  O painel (no Chrome) manda o cupom pra cá e ele imprime NA HORA,
#  direto na impressora do Windows, sem abrir janela nenhuma.
#  Escuta só neste computador: http://127.0.0.1:9123
# =========================================================
$ErrorActionPreference = "Stop"
$Port = 9123
$Allowed = @("https://geladao-brothers.vercel.app", "https://cardapiovyntra.com.br", "https://www.cardapiovyntra.com.br")
$AllowedLocal = @("http://localhost", "http://127.0.0.1")

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class GeladaoRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Impressora nao encontrada: " + printer);
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "Cupom Geladao"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) throw new Exception("A impressora recusou o cupom");
      StartPagePrinter(h);
      int w; WritePrinter(h, data, data.Length, out w);
      EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
"@

function Get-PrinterList {
  try { return @(Get-CimInstance Win32_Printer -ErrorAction Stop) } catch {}
  try { return @(Get-WmiObject Win32_Printer -ErrorAction Stop) } catch {}
  return @()
}
function Get-Printers { return @(Get-PrinterList | ForEach-Object { $_.Name }) }
function Get-DefaultPrinter {
  $p = Get-PrinterList | Where-Object { $_.Default } | Select-Object -First 1
  if ($p) { return [string]$p.Name } else { return "" }
}
function Esc-Json([string]$s) { if ($null -eq $s) { return "" }; return ($s -replace '\\', '\\' -replace '"', '\"') }

function Send-Response($stream, [int]$code, [string]$body, [string]$origin) {
  $status = @{ 200 = "OK"; 204 = "No Content"; 403 = "Forbidden"; 404 = "Not Found"; 500 = "Error" }[$code]
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $allow = "*"; if ($origin) { $allow = $origin }
  $head = "HTTP/1.1 $code $status`r`n" +
          "Content-Type: application/json; charset=utf-8`r`n" +
          "Content-Length: $($bytes.Length)`r`n" +
          "Access-Control-Allow-Origin: $allow`r`n" +
          "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
          "Access-Control-Allow-Headers: *`r`n" +
          "Access-Control-Allow-Private-Network: true`r`n" +
          "Connection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length)
  if ($bytes.Length -gt 0) { $stream.Write($bytes, 0, $bytes.Length) }
  $stream.Flush()
}

function Read-Request($stream) {
  # lê o cabeçalho até a linha em branco
  $buf = New-Object byte[] 65536
  $ms = New-Object System.IO.MemoryStream
  $headerEnd = -1
  while ($headerEnd -lt 0) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $ms.Write($buf, 0, $n)
    $all = $ms.ToArray()
    for ($i = 3; $i -lt $all.Length; $i++) {
      if ($all[$i-3] -eq 13 -and $all[$i-2] -eq 10 -and $all[$i-1] -eq 13 -and $all[$i] -eq 10) { $headerEnd = $i + 1; break }
    }
    if ($ms.Length -gt 1048576) { break }
  }
  if ($headerEnd -lt 0) { return $null }
  $all = $ms.ToArray()
  $headText = [System.Text.Encoding]::ASCII.GetString($all, 0, $headerEnd)
  $lines = $headText -split "`r`n"
  $first = $lines[0] -split " "
  $h = @{}
  foreach ($l in $lines[1..($lines.Length - 1)]) { $k = $l.IndexOf(":"); if ($k -gt 0) { $h[$l.Substring(0, $k).Trim().ToLower()] = $l.Substring($k + 1).Trim() } }
  $len = 0; if ($h.ContainsKey("content-length")) { $len = [int]$h["content-length"] }
  $body = New-Object System.IO.MemoryStream
  $have = $all.Length - $headerEnd
  if ($have -gt 0) { $body.Write($all, $headerEnd, $have) }
  while ($body.Length -lt $len) {
    $n = $stream.Read($buf, 0, [Math]::Min($buf.Length, $len - $body.Length))
    if ($n -le 0) { break }
    $body.Write($buf, 0, $n)
  }
  return @{ Method = $first[0]; Path = $first[1]; Headers = $h; Body = $body.ToArray() }
}

try {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
  $listener.Start()
} catch {
  # já tem um aberto: não abre outro
  exit
}

while ($true) {
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()
    $client.ReceiveTimeout = 5000; $client.SendTimeout = 5000
    $stream = $client.GetStream()
    $req = Read-Request $stream
    if ($null -eq $req) { $client.Close(); continue }
    $origin = $req.Headers["origin"]
    $okOrigin = (-not $origin) -or ($Allowed -contains $origin) -or ($AllowedLocal | Where-Object { $origin -eq $_ -or $origin.StartsWith($_ + ":") })
    if (-not $okOrigin) { Send-Response $stream 403 '{"ok":false,"error":"site nao autorizado"}' $origin; $client.Close(); continue }

    $path = $req.Path; $query = ""
    $qi = $path.IndexOf("?"); if ($qi -ge 0) { $query = $path.Substring($qi + 1); $path = $path.Substring(0, $qi) }

    if ($req.Method -eq "OPTIONS") {
      Send-Response $stream 204 "" $origin
    }
    elseif ($req.Method -eq "GET" -and $path -eq "/status") {
      $list = Get-Printers
      $def = Get-DefaultPrinter
      $arr = ($list | ForEach-Object { '"' + (Esc-Json $_) + '"' }) -join ","
      Send-Response $stream 200 ('{"ok":true,"app":"impressora-geladao","version":"1.0","printer":"' + (Esc-Json $def) + '","printers":[' + $arr + ']}') $origin
    }
    elseif ($req.Method -eq "POST" -and $path -eq "/print") {
      $printer = ""
      foreach ($pair in ($query -split "&")) { $kv = $pair -split "=", 2; if ($kv[0] -eq "printer" -and $kv.Length -gt 1) { $printer = [System.Uri]::UnescapeDataString($kv[1].Replace("+", " ")) } }
      if (-not $printer) { $printer = Get-DefaultPrinter }
      try {
        [GeladaoRawPrint]::Send($printer, $req.Body)
        Send-Response $stream 200 '{"ok":true}' $origin
      } catch {
        Send-Response $stream 200 ('{"ok":false,"error":"' + (Esc-Json $_.Exception.Message) + '"}') $origin
      }
    }
    else {
      Send-Response $stream 404 '{"ok":false,"error":"nao encontrado"}' $origin
    }
  } catch {
  } finally {
    if ($client) { try { $client.Close() } catch {} }
  }
}
