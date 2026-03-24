// Fiji/ImageJ 线虫视频分析宏 - wrMTrck 运动追踪
// 以 -macro 运行可避免 "Cannot instantiate headless dialog except in macro mode"
// 用法: Fiji --headless -macro nematode_tracker.ijm 'dir=/path/to/videos'
arg = getArgument();
if (indexOf(arg, "dir=") == 0) dir = substring(arg, 4, lengthOf(arg));
else dir = arg;
if (dir == "") {
  print("Error: No input directory. Use: -macro nematode_tracker.ijm dir=/path");
  run("Quit");
}
// 确保 dir 以分隔符结尾
if (!endsWith(dir, "/") && !endsWith(dir, "\\")) dir = dir + "/";
setBatchMode(true);
list = getFileList(dir);
count = 0;
for (i = 0; i < list.length; i++) {
  name = list[i];
  if (!endsWith(name, "/") && (endsWith(name, ".avi") || endsWith(name, ".AVI") || endsWith(name, ".mp4") || endsWith(name, ".MP4") || endsWith(name, ".mov") || endsWith(name, ".MOV"))) {
    count++;
    path = dir + name;
    print("Processing: " + name);
    if (!File.exists(path)) {
      print("Error: File not found: " + path);
    } else {
    // open(path) 对视频更可靠；run("Open...") 在 headless 下有时无法打开 AVI
    open(path);
    if (nImages == 0) {
      run("Open...", "open=[" + path + "] convert");
    }
    if (nImages == 0) {
      print("Error: Could not open " + path);
    } else {
    run("8-bit");
    run("Subtract Background...", "rolling=50 light stack");
    setThreshold(240, 255);
    run("Convert to Mask", "stack");
    run("Invert", "stack");
    dotIdx = lastIndexOf(path, ".");
    if (dotIdx >= 0) basePath = substring(path, 0, dotIdx);
    else basePath = path;
    save2 = basePath + "_bendthreshold2.txt";
    save3 = basePath + "_bendthreshold3.txt";
    run("wrMTrck ", "minsize=2000 maxsize=5000 maxvelocity=100 maxareachange=900 mintracklength=10 bendthreshold=2.0 binsize=0.0 saveresultsfile showpathlengths smoothing rawdata=0 benddetect=1 fps=60 backsub=0 threshmode=Otsu fontsize=16 save=[" + save2 + "]");
    run("wrMTrck ", "minsize=2000 maxsize=5000 maxvelocity=100 maxareachange=900 mintracklength=10 bendthreshold=3.0 binsize=0.0 saveresultsfile showpathlengths smoothing rawdata=0 benddetect=1 fps=60 backsub=0 threshmode=Otsu fontsize=16 save=[" + save3 + "]");
    run("Close All");
    print("Finished: " + name);
    }
    }
  }
}
print("Batch processing complete. Processed " + count + " file(s).");
run("Quit");
