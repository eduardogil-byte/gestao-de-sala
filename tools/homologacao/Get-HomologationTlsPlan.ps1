[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[0-9A-Fa-f]{40}$')][string]$CertificateThumbprint,
    [Parameter(Mandatory)][string]$EndpointDnsName
)
$ErrorActionPreference='Stop'
$cert = Get-Item -LiteralPath "Cert:\LocalMachine\My\$CertificateThumbprint"
if (-not $cert.HasPrivateKey -or $cert.NotBefore -gt (Get-Date) -or $cert.NotAfter -le (Get-Date)) { throw 'Certificado sem chave privada ou fora da validade.' }
if (@($cert.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.1' }).Count -eq 0) { throw 'EKU Server Authentication obrigatorio.' }
if ([string]::IsNullOrWhiteSpace($EndpointDnsName) -or $EndpointDnsName -inotin @($cert.DnsNameList | ForEach-Object { $_.Unicode })) { throw 'SAN deve conter exatamente o DNS aprovado; nao usar bypass.' }
$chain=New-Object Security.Cryptography.X509Certificates.X509Chain
try { if (-not $chain.Build($cert)) { throw 'Cadeia nao confiavel. Solicite certificado a autoridade autorizada.' } }
finally { $chain.Dispose() }
Write-Output 'Candidato aprovado para revisao. Nenhuma configuracao alterada.'
Write-Output 'Administrador: conferir requisitos do SQL Server, conceder somente leitura da chave privada ao servico SQL, vincular pelo SQL Server Configuration Manager e planejar reinicio autorizado.'
Write-Output 'Depois: Test-HomologationTls.ps1 sob cada identidade. A validacao do cliente e obrigatoria; este plano nao comprova vinculacao nem acesso do servico a chave.'
