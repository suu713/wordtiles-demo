"""Map Unity IL2CPP metadata to native addresses without running app code."""
import io
import json
from pathlib import Path
import re
import struct
import sys

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports'/'apk-analysis'
sys.path.insert(0,str(OUT/'vendor'))
from elftools.elf.elffile import ELFFile
from capstone import Cs,CS_ARCH_ARM,CS_MODE_ARM,CS_MODE_THUMB

class Metadata:
    def __init__(self):
        self.raw=(OUT/'assets_bin_Data_Managed_Metadata_global-metadata.dat').read_bytes()
        self.header=struct.unpack_from('<64I',self.raw)
        assert self.header[:2]==(0xFAB11BAF,31)
        self.types=[];self.methods=[];self.images=[]
        for pos in range(self.header[40],self.header[40]+self.header[41],88):
            row=struct.unpack_from('<16I8H2I',self.raw,pos)
            self.types.append({'index':len(self.types),'name':self.string(row[0]),'namespace':self.string(row[1]),'fieldStart':row[8],'methodStart':row[9],'methodCount':row[16],'fieldCount':row[18],'byvalType':row[2],'flags':row[7],'bitfield':row[24],'token':row[25]})
        for pos in range(self.header[12],self.header[12]+self.header[13],36):
            row=struct.unpack_from('<7I4H',self.raw,pos)
            params=[]
            for index in range(row[10]):
                p=struct.unpack_from('<3I',self.raw,self.header[22]+(row[4]+index)*12)
                params.append({'name':self.string(p[0]),'type':p[2]})
            self.methods.append({'index':len(self.methods),'name':self.string(row[0]),'owner':row[1],'returnType':row[2],'token':row[6],'flags':row[7],'params':params})
        for pos in range(self.header[42],self.header[42]+self.header[43],40):
            row=struct.unpack_from('<10I',self.raw,pos)
            self.images.append({'name':self.string(row[0]),'typeStart':row[2],'typeCount':row[3]})
    def string(self,index):
        pos=self.header[6]+index
        end=self.raw.find(b'\0',pos)
        return self.raw[pos:end].decode('utf-8',errors='replace')
    def fields(self,typ):
        result=[]
        for index in range(typ['fieldStart'],typ['fieldStart']+typ['fieldCount']):
            row=struct.unpack_from('<3I',self.raw,self.header[24]+index*12)
            result.append({'index':index,'name':self.string(row[0]),'type':row[1],'token':row[2]})
        return result
    def literals(self):
        result=[]
        for index,pos in enumerate(range(self.header[2],self.header[2]+self.header[3],8)):
            length,offset=struct.unpack_from('<2I',self.raw,pos)
            data=self.raw[self.header[4]+offset:self.header[4]+offset+length]
            value=data.decode('utf-8',errors='replace')
            if re.search(r'extra.?word|bonus.?word|dictionary|collected_extra|duplicate',value,re.I):
                result.append({'index':index,'value':value})
        return result

class Native:
    def __init__(self):
        self.raw=(OUT/'lib_armeabi-v7a_libil2cpp.so').read_bytes()
        self.elf=ELFFile(io.BytesIO(self.raw))
        self.segments=[dict(seg.header) for seg in self.elf.iter_segments() if seg['p_type']=='PT_LOAD']
        self.modules={};self.names={}
    def offset(self,address):
        for seg in self.segments:
            if seg['p_vaddr']<=address<seg['p_vaddr']+seg['p_filesz']:
                return seg['p_offset']+address-seg['p_vaddr']
        raise ValueError(hex(address))
    def address(self,offset):
        for seg in self.segments:
            if seg['p_offset']<=offset<seg['p_offset']+seg['p_filesz']:
                return seg['p_vaddr']+offset-seg['p_offset']
        raise ValueError(hex(offset))
    def u32(self,address):return struct.unpack_from('<I',self.raw,self.offset(address))[0]
    def locate_modules(self,meta):
        for image in meta.images:
            marker=image['name'].encode()+b'\0'
            pos=self.raw.find(marker)
            if pos<0:continue
            pointer=struct.pack('<I',self.address(pos));cursor=0;candidates=[]
            while True:
                ref=self.raw.find(pointer,cursor)
                if ref<0:break
                cursor=ref+1
                if ref%4:continue
                count,table=struct.unpack_from('<II',self.raw,ref+4)
                if not 0<count<200000:continue
                try:
                    array=struct.unpack_from('<'+str(count)+'I',self.raw,self.offset(table))
                    # A module method pointer array contains executable addresses.
                    populated=[a for a in array[:50] if a]
                    if len(populated)<2 or not all(any(s['p_flags']&1 and s['p_vaddr']<=a<s['p_vaddr']+s['p_memsz'] for s in self.segments) for a in populated):continue
                    candidates.append((self.address(ref),array))
                except (ValueError,struct.error):continue
            if len(candidates)!=1:
                print('MODULE_CANDIDATES',image['name'],len(candidates));continue
            base,array=candidates[0]
            self.modules[image['name']]={'address':base,'count':len(array),'pointers':array}
            for typ in meta.types[image['typeStart']:image['typeStart']+image['typeCount']]:
                for method in meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]:
                    token=(method['token']&0xffffff)-1
                    if token<len(array) and array[token]:
                        address=array[token];method['address']=address
                        name=(typ['namespace']+'.' if typ['namespace'] else '')+typ['name']+'.'+method['name']
                        self.names.setdefault(address&~1,[]).append(name)
        self.addresses=sorted(self.names)
    def disasm(self,address,limit=400):
        mode=CS_MODE_THUMB if address&1 else CS_MODE_ARM
        start=address&~1
        next_method=next((value for value in self.addresses if value>start),start+limit*4)
        size=min(next_method-start,limit*4)
        offset=self.offset(start)
        engine=Cs(CS_ARCH_ARM,mode)
        result=[]
        for inst in engine.disasm(self.raw[offset:offset+size],start):
            note=''
            if inst.mnemonic in ('bl','blx','b','b.w') and inst.op_str.startswith('#'):
                target=int(inst.op_str[1:],0)&~1
                if target in self.names:note=' ; '+' | '.join(self.names[target][:3])
            result.append(hex(inst.address)+' '+inst.mnemonic+' '+inst.op_str+note)
        return result

def main():
    meta=Metadata();native=Native();native.locate_modules(meta)
    print('METADATA',len(meta.types),len(meta.methods),'MODULES',len(native.modules))
    print('ELF_SECTIONS',[section.name for section in native.elf.iter_sections()])
    matched=[]
    for typ in meta.types:
        if re.search(r'ExtraWord|WordService|WordValidator|LevelData|WordInfo|DictionaryData|GameConfig|ExtraWordCollectLevel',typ['name']):
            item={**typ,'fields':meta.fields(typ),'methods':meta.methods[typ['methodStart']:typ['methodStart']+typ['methodCount']]}
            matched.append(item)
            print(json.dumps(item,ensure_ascii=True))
    (OUT/'managed-word-types.json').write_text(json.dumps(matched,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'word-literals.json').write_text(json.dumps(meta.literals(),ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'method-addresses.json').write_text(json.dumps({hex(address):names for address,names in native.names.items()},ensure_ascii=False),encoding='utf-8')
    code=[]
    for typ in matched:
        if typ['name'] not in ('ExtraWordService','WordService','ExtraWordsPopupController','ExtraWordCollectLevel'):continue
        for method in typ['methods']:
            if 'address' not in method:continue
            code.append('\n'+typ['name']+'.'+method['name']+' '+hex(method['address']))
            code.extend(native.disasm(method['address']))
    (OUT/'native-word-code.txt').write_text('\n'.join(code),encoding='utf-8')
    print('CODE_SAVED',len(code),'lines')
if __name__=='__main__':main()
