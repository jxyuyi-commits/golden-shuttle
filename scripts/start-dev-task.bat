@echo off
cd /d D:\dev\golden-shuttle
set PATH=C:\Program Files\nodejs;%PATH%
node scripts\dev.cjs > _dev_out.log 2> _dev_err.log
