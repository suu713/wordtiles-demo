from pathlib import Path
import urllib.request

root=Path(__file__).resolve().parents[1]/'reports'/'apk-analysis'
for filename in ['MetadataClass.cs','Il2CppClass.cs','Metadata.cs','Il2Cpp.cs']:
    url='https://raw.githubusercontent.com/Perfare/Il2CppDumper/master/Il2CppDumper/Il2Cpp/'+filename
    try:
        with urllib.request.urlopen(url,timeout=20) as response:
            data=response.read()
        (root/filename).write_bytes(data)
        print(filename,len(data))
    except Exception as error:
        print(filename,type(error).__name__,str(error))
