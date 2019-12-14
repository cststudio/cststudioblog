/*
生成mainlead.yml文件，内容示例：

lead: 
  - text: 宠辱不惊，看庭前花开花落
  - text: 去留无意，望天空云卷云舒
*/
const fs         = require("fs");

const file = "mainlead.yml";

// 按需添加
const arr = [
["认认真真、踏踏实实做事，细致严谨。"],
["所有牛逼背后都是苦逼堆积的坚持，", "所有苦逼都是傻逼般的不放弃。"],
["以有所得之心，求无所得之果"],
["宠辱不惊，看庭前花开花落；", "去留无意，望天空云卷云舒。"],
["为天地立心，为生民立命，", "为往圣继绝学，为万世开太平。"],
["人法地，地法天，", "天法道，道法自然"],
];

function main()
{
    // 以写方式，相当于从头创建文件
    fs.writeFileSync(file, "lead:\r\n", { 'flag': 'w' });
    
    // 随机找到一条
    let i = parseInt(Math.random() * arr.length);
    
    for(var col=0;col<arr[i].length;col++)
    {
        console.log(arr[i][col]);
        var buffer = new Object();
        buffer = "  - text: " + arr[i][col] + "\r\n";
        
        fs.writeFileSync(file, buffer, { 'flag': 'a' });

    }
// 遍历二维
/*
    for(var row=0;row<arr.length;row++)
    {
        for(var col=0;col<arr[row].length;col++)
        {
            console.log(arr[row][col]);
        }
    }
*/
    return;

}

main();