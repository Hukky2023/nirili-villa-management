import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const roots=['app','lib'];
const allowedExtensions=new Set(['.ts','.tsx','.js','.jsx']);
function walk(dir){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const full=path.join(dir,entry.name);
  return entry.isDirectory()?walk(full):(allowedExtensions.has(path.extname(entry.name))?[full]:[]);
 });
}

test('all application time UI and formatting stays 24-hour',()=>{
 const violations=[];
 for(const file of roots.flatMap(walk)){
  const source=fs.readFileSync(file,'utf8');
  if(/type\s*=\s*["']time["']/i.test(source))violations.push(file+': native time input can render AM/PM');
  if(/\b(?:AM|PM)\b/.test(source))violations.push(file+': AM/PM text found');
  if(/\.toLocaleTimeString\(\s*\)/.test(source))violations.push(file+': locale-default time formatter found');
  if(/\.toLocaleString\(\s*\)/.test(source))violations.push(file+': locale-default date/time formatter found');
 }
 assert.deepEqual(violations,[]);
});

test('core scheduling logic validates HH:mm on a 00-23 clock',()=>{
 const files=[
  'lib/transport-plan.ts',
  'lib/excursion-operations.ts',
  'app/api/excursion-schedules/route.ts',
  'app/api/buggy-driver/route.ts',
  'app/api/buggy-management/route.ts'
 ];
 for(const file of files){
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d/,file+' must enforce 24-hour HH:mm');
 }
});
