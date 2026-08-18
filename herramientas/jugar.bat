@echo off
rem Doble clic para jugar: llama a jugar.ps1 saltandose la politica de
rem ejecucion de PowerShell, que en un Windows recien instalado bloquea los .ps1
rem aunque sean del propio disco.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0jugar.ps1" %*
