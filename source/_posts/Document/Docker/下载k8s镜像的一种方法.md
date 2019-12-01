---
title: 下载k8s镜像的一种方法
urlname: download-k8s-images
authors:
  - latelee
categories:
  - Document
  - Docker
date: 2019-11-26 23:14:59
updated: 2019-11-27 23:14:59
---

部署k8s集群时，要使用众多来自 gcr.io 的镜像，但国内无法下载。需要使用镜像地址中转下载，最后重新改名，以保持与原始镜像一致。  

<!-- more -->

脚本内容：
```shell
#!/usr/bin/env bash
# 脚本名称：pullk8s.sh
# 使用：pullk8s.sh k8s.gcr.io/pause-amd64:3.0  
# 会自动转换地址，再修改镜像，保持与原来一致。
# 来自：https://github.com/xuxinkun/littleTools/blob/master/azk8spull.sh
# gcr.io也可以用阿里云的：registry.cn-hangzhou.aliyuncs.com/google_containers/
image=$1
if [ -z $image ]; then
    echo "image name cannot be null."
    exit;
fi

array=(`echo $image | tr '/' ' '` )

domainName=""
repoName=""
imageName=""

if [ ${#array[*]} -eq 3 ]; then
    repoName=${array[1]}
    imageName=${array[2]}
    if [ "${array[0]}"x = "docker.io"x ]; then
        domainName="dockerhub.azk8s.cn"
    elif [ "${array[0]}"x = "gcr.io"x ]; then
        domainName="gcr.azk8s.cn"
    elif [ "${array[0]}"x = "quay.io"x ]; then
        domainName="quay.azk8s.cn"
    else
        echo 'can not support pulling $image right now.'
    fi
elif [ ${#array[*]} -eq 2 ]; then
    if [ "${array[0]}"x = "k8s.gcr.io"x ]; then
        domainName="gcr.azk8s.cn"
        repoName="google_containers"
        imageName=${array[1]}
    else
        domainName="dockerhub.azk8s.cn"
        repoName=${array[0]}
        imageName=${array[1]}
    fi
elif [ ${#array[*]} -eq 1 ]; then
    domainName="dockerhub.azk8s.cn"
    repoName="library"
    imageName=${array[0]}
else
    echo "not support pulling $image."
    exit
fi
if [ $domainName != "" ]; then
    echo "try to pull image from mirror $domainName/$repoName/$imageName."
    docker pull  $domainName/$repoName/$imageName
    if [ $? -eq 0 ]; then
        echo "try to tag $domainName/$repoName/$imageName to $image."
        docker tag $domainName/$repoName/$imageName $image
        if [ $? -eq 0 ]; then
            docker rmi $domainName/$repoName/$imageName
            echo 'pull finished.'
        fi
    fi
fi
```

添加可执行属性：`chmod +x pullk8s.sh`。  
放置系统 PATH 目录，如 /usr/bin。  
使用：`pullk8s.sh k8s.gcr.io/pause-amd64:3.0`。  
