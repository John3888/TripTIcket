@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
cd /d "%~dp0.."
if not exist build mkdir build
cl /nologo /EHsc /std:c++17 tests\filter_test.cpp /Fo:build\filter_test.obj /Fe:build\filter_test.exe
if errorlevel 1 exit /b 1
build\filter_test.exe
