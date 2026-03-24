// Fiji/ImageJ 线虫图像分析宏 - Analyze Particles 计数与形态学
// 以 -macro 运行可避免 "Cannot instantiate headless dialog except in macro mode"
// 用法: Fiji --headless -macro image_analyzer.ijm 'image_path|||output_path|||rolling_radius'
arg = getArgument();
sep = "|||";
idx1 = indexOf(arg, sep);
if (idx1 < 0) {
  File.saveString(arg, '{"status":"error","error":"Invalid args: need image|||output|||rolling","count":0}');
  run("Quit");
}
image_path = substring(arg, 0, idx1);
rest = substring(arg, idx1 + 3, lengthOf(arg));
idx2 = indexOf(rest, sep);
if (idx2 < 0) {
  output_path = rest;
  rolling = 50;
} else {
  output_path = substring(rest, 0, idx2);
  rolling_str = substring(rest, idx2 + 3, lengthOf(rest));
  rolling = parseInt(rolling_str);
  if (rolling < 1) rolling = 50;
}
setBatchMode(true);
if (!File.exists(image_path)) {
  err = '{"status":"error","error":"Image file not found","count":0}';
  File.saveString(output_path, err);
  run("Quit");
}
open(image_path);
if (nImages == 0) {
  run("Open...", "open=[" + image_path + "] convert");
}
if (nImages == 0) {
  err = '{"status":"error","error":"Failed to open image","count":0}';
  File.saveString(output_path, err);
  run("Quit");
}
run("RGB to Grayscale", "");
run("8-bit", "");
if (nImages > 1) run("Stack to Images", "");
run("Subtract Background...", "rolling=" + rolling + " light");
run("Set Auto Threshold", "method=Default");
run("Convert to Mask", "");
run("Analyze Particles...", "size=5-100000 circularity=0.00-1.00 show=Nothing display clear add");
count = nResults;
if (count < 0) count = 0;
w = getWidth();
h = getHeight();
run("Close All");
run("Clear Results");
// 从路径提取文件名
lastSlash = lastIndexOf(image_path, "/");
if (lastSlash < 0) lastSlash = lastIndexOf(image_path, "\\");
if (lastSlash >= 0) filename = substring(image_path, lastSlash + 1, lengthOf(image_path));
else filename = image_path;
json = '{"status":"success","count":' + count + ',"filename":"' + filename + '","dimensions":[' + w + ',' + h + ']}';
File.saveString(output_path, json);
run("Quit");
