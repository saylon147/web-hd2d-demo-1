import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const root=fileURLToPath(new URL('../',import.meta.url));
const defaultBlender='C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const command=process.env.BLENDER_PATH || (existsSync(defaultBlender)?defaultBlender:'blender');
const child=spawn(command,['--background','--factory-startup','--python-exit-code','1','--python',resolve(root,'scripts/optimize_tripo_asset.py'),'--',...process.argv.slice(2)],{cwd:root,stdio:'inherit',windowsHide:true,shell:false});
child.on('error',(error)=>{process.stderr.write(`Blender unavailable; set BLENDER_PATH. ${error.message}\n`);process.exitCode=1;});
child.on('exit',(code)=>{process.exitCode=code??1;});
