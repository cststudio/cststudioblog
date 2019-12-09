/*
npm install superagent cheerio
npm install cheerio

github api出现

Request forbidden by administrative rules. Please make sure your request has a U
ser-Agent header (http://developer.github.com/v3/#user-agent-required). Check ht
tps://developer.github.com for other possible causes.
解决：添加User-Agent

*/
//导入依赖包
const https       = require("https");
const path       = require("path");
const url        = require("url");
const fs         = require("fs");

var util = require('util');

const superagent = require("superagent");
const cheerio    = require("cheerio");
const file = "openworld.yml";

const userAgents = [
  'Mozilla/5.0 (X11; U; Linux i686; en-US; rv:1.8.0.12) Gecko/20070731 Ubuntu/dapper-security Firefox/1.5.0.12',
  'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0; Acoo Browser; SLCC1; .NET CLR 2.0.50727; Media Center PC 5.0; .NET CLR 3.0.04506)',
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.56 Safari/535.11',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/535.20 (KHTML, like Gecko) Chrome/19.0.1036.7 Safari/535.20',
  'Mozilla/5.0 (X11; U; Linux i686; en-US; rv:1.9.0.8) Gecko Fedora/1.9.0.8-1.fc10 Kazehakase/0.5.6',
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.1 (KHTML, like Gecko) Chrome/21.0.1180.71 Safari/537.1 LBBROWSER',
  'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Win64; x64; Trident/5.0; .NET CLR 3.5.30729; .NET CLR 3.0.30729; .NET CLR 2.0.50727; Media Center PC 6.0) ,Lynx/2.8.5rel.1 libwww-FM/2.14 SSL-MM/1.4.1 GNUTLS/1.2.9',
  'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1; .NET CLR 1.1.4322; .NET CLR 2.0.50727)',
  'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0; SLCC2; .NET CLR 2.0.50727; .NET CLR 3.5.30729; .NET CLR 3.0.30729; Media Center PC 6.0; .NET4.0C; .NET4.0E; QQBrowser/7.0.3698.400)',
  'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1; QQDownload 732; .NET4.0C; .NET4.0E)',
  'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:2.0b13pre) Gecko/20110307 Firefox/4.0b13pre',
  'Opera/9.80 (Macintosh; Intel Mac OS X 10.6.8; U; fr) Presto/2.9.168 Version/11.52',
  'Mozilla/5.0 (X11; U; Linux i686; en-US; rv:1.8.0.12) Gecko/20070731 Ubuntu/dapper-security Firefox/1.5.0.12',
  'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0; SLCC2; .NET CLR 2.0.50727; .NET CLR 3.5.30729; .NET CLR 3.0.30729; Media Center PC 6.0; .NET4.0C; .NET4.0E; LBBROWSER)',
  'Mozilla/5.0 (X11; U; Linux i686; en-US; rv:1.9.0.8) Gecko Fedora/1.9.0.8-1.fc10 Kazehakase/0.5.6',
  'Mozilla/5.0 (X11; U; Linux; en-US) AppleWebKit/527+ (KHTML, like Gecko, Safari/419.3) Arora/0.6',
  'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0; SLCC2; .NET CLR 2.0.50727; .NET CLR 3.5.30729; .NET CLR 3.0.30729; Media Center PC 6.0; .NET4.0C; .NET4.0E; QQBrowser/7.0.3698.400)',
  'Opera/9.25 (Windows NT 5.1; U; en), Lynx/2.8.5rel.1 libwww-FM/2.14 SSL-MM/1.4.1 GNUTLS/1.2.9',
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36'
];

function getbusybox()
{
var target = "https://busybox.net/downloads/";
superagent
    .get(target)
    .end((error,response)=>{
        // 1.获取页面文档数据
        var content = response.text;
        var $ = cheerio.load(content);
        var result=[];
        // 2. 找到 pre 内容
        var linksDom = $("pre");
        // 3. pre只有一个元素，有换行，过滤，并逆转，找到tar.bz2那一行，即为最新版本
        // busybox-1.31.1.tar.bz2  2019-10-25 08:42  2.3M
        linksDom.each((index, item) => {
            var text = $(item).text();
            text = text.split("\n").reverse();
            for (var i = 0; i < 100; i++)
            {
                if (text[i].includes("tar.bz2"))
                {
                    console.log("content ", text[i]);
                    text = text[i];
                    break;
                }
            }
            text = text.split(" ");
            console.log(text);
        })
        //将数组转换成字符串
        result=JSON.stringify(result);

    });
}


function getkernel()
{
var target = "https://www.kernel.org/";
superagent
    .get(target)
    .end((error,response)=>{
        // 1.获取页面文档数据
        var content = response.text;
        var $ = cheerio.load(content);
        var result=[];
        // 2. 找到 pre 内容
        var linksDom = $("pre");
        // 3. pre只有一个元素，有换行，过滤，并逆转，找到tar.bz2那一行，即为最新版本
        // busybox-1.31.1.tar.bz2  2019-10-25 08:42  2.3M
        linksDom.each((index, item) => {
            var text = $(item).text();
            text = text.split("\n").reverse();
            for (var i = 0; i < 100; i++)
            {
                if (text[i].includes("tar.bz2"))
                {
                    console.log("content ", text[i]);
                    text = text[i];
                    break;
                }
            }
            text = text.split(" ");
            console.log(text);
        })
        //将数组转换成字符串
        result=JSON.stringify(result);

    });
}

function github_release(name, respo)
{
var target = "https://api.github.com/repos/" + respo + "/releases/latest";

let userAgent = userAgents[parseInt(Math.random() * userAgents.length)];
superagent
    .get(target)
    .set({'User-Agent': userAgent})
    .end((error,response)=>{
        var content = response.text;
        cxt = JSON.parse(content);
        //console.log(json);
        console.log(respo, "\r\n", cxt.tag_name, " ", cxt.html_url, " ", cxt.published_at);
        var buffer = "";
        buffer += "  - name: " + name + "\r\n";
        buffer += "    version: " + cxt.tag_name + "\r\n";
        buffer += "    time: \"" + cxt.published_at + "\"\r\n";
        buffer += "    href: " + "todo" + "\r\n";
        buffer += "    download: " + cxt.html_url + "\r\n";
        
        // 追加方式
        fs.writeFile(file, buffer, { 'flag': 'a' },  (err) => {});
    });
}

Date.prototype.Format = function(fmt) { //author: meizz 
    var o = {
        "M+": this.getMonth() + 1, //月份 
        "d+": this.getDate(), //日 
        "h+": this.getHours(), //小时 
        "m+": this.getMinutes(), //分 
        "s+": this.getSeconds(), //秒 
        "S": this.getMilliseconds() //毫秒 
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}

function main()
{
    // 以写方式，相当于从头创建文件
    fs.writeFile(file, "opentitle: 开源追踪\r\nopenlead: 跟上开源的步伐\r\n", { 'flag': 'w' },  (err) => {});
    var myDate = (new Date()).Format("yyyy-MM-dd hh:mm:ss");
    datetime = "update: \"" + myDate + "\"\r\n";
    fs.writeFile(file, datetime, { 'flag': 'a' },  (err) => {});
    
    fs.writeFile(file, "openproject: \r\n", { 'flag': 'a' },  (err) => {});
    
    github_release("Docker", "docker/docker-ce");
    github_release("Kubernetes", "kubernetes/kubernetes");
    github_release("k3s", "rancher/k3s");

    //getbusybox();
    //getkernel();
}

main();