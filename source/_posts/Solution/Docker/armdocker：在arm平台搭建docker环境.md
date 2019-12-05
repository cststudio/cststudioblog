---
title: ARM 平台搭建docker环境实录
urlname: armdocker-build-docker-on-arm
tags:
  - armdocker
categories:
  - Solution
  - Docker
date: 2019-12-01 16:24:15
---

<center><h1>ARM平台搭建docker环境实录</h1></center>
<center>迟思堂工作室</center>
  

## 一、背景
在主流发行版的 Linux 系统运行 Docker 是十分简单的事，只需一条命令即可。而 ARM 平台，如 TK1、树莓派等，使用 Debian 或 Ubuntu 或其衍生系统，亦是闲事。  
本文尝试是在 ARM 平台使用 buildroot 构建的系统上搭建 docker 运行环境。本实录的步骤和解题思路有局限性，但也有一定实践性。理论上，所有自行搭建 docker 环境的，均可参考本文。本文内容较多，请酌情阅读。  

<!-- more -->

## 二、前提
本文内容有一定难度，涉及东西较多，需要知道内核的 Makefile 和 Kconfig ，熟悉 make menuconfig（kernel/busybox/buildroot/cross-ng 等，均用该方式），知道内核配置，如编译为模块（`M`），编译进内核（`*`）。

## 三、要点
Docker 需要使用 systemd 来启动，不能直接用 `/usr/bin/dockerd -H fd://` 来启动。使用 buildroot ，需要选择 systemd 代替默认的 init 机制。  
systemd 需要额外的库，buildroot 版本太低不支持。新版本默认有 Docker 的选项。建议使用2017年后的版本。  
Docker 服务配置文件为 `/lib/systemd/system/docker.service`。启动相关命令（实验中会经常使用到）：  
```
启动
systemctl start docker
停止
systemctl stop docker
重启
systemctl restart docker
查看状态
systemctl status docker.service
```

以上提及知识点，有兴趣者可自行查询。  

## 四、心得
在使用 make menuconfig（包括但不限于 kernel/busybox/buildroot/cross-ng 等）时， 按 / ，输入要查询的关键字，确认位置。注意，在内核配置中，不需要添加 CONFIG_ 关键字。  

对于没有明显提示的配置，可以通过源码文件，或者 Makefile、Kconfig 来确定。  

在一屏幕显示的选项内，按指定关键字可快速定位到选项。选项可以有多个。继续按即可。在ncurese界面以粗体显示。如在 Device Drivers中，按字母 p 可定位到  Parallel port support、PPS support、 PTP clock support、 Pin controllers、 Power supply class support。注意，只有当前屏幕上显示的才会定位到，屏幕外的无法定位，但可以按向下箭头翻页，可以将配置界面窗口最大化，描述看似复杂，有兴趣者尝试即知。  

在重新编译后，一定要确认版本，如内核，可以通过 `uname -a` 得到编译时间，如 buildroot，可以通过定入特定文件来确认。   

## 五、实验
本文实验环境：  
* buildroot: 2018.02 (busybox: 1.27.2)
* kernel: 4.15 
* 交叉编译器：buildroot 构建，7.2

本文针对 Docker 的配置，与此之外的，略过。  

buildroot 配置：
```
System configuration  ---> 
   Init system (systemd)  --->
    /bin/sh (bash)  ---> 

Target packages  --->
    System tools  --->
      -*- docker-containerd
      [*] docker-engine
      [*]   docker daemon
      -*- docker-proxy
      -*- runc
      -*- systemd  ---> 
```

### 5.1 第一次
#### 5.1.1 启动
参考虚拟机Docker服务的启动参数：  
```
root@latelee:~# ps aux | grep docker
root     11602  0.1  1.6 858812 34488 ?   Ssl  Jul27 224:21 /usr/bin/dockerd -H fd://
```
在板子上执行 `dockerd -H fd://` 启动之：
```
# dockerd -H fd://
no sockets found via socket activation: make sure the service was started by systemd
```

提示需要使用systemd启动。参考前文开启 systemd。

systemd 不是一个命令，而是命令集，所谓用systemd启动，即用systemctl命令启动。其使用的配置文件位于目录 /lib/systemd/system/ 中。如 docker.service 文件内容如下：
```
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target docker.socket firewalld.service
Wants=network-online.target
Requires=docker.socket

[Service]
Type=notify
# the default is not to use systemd for cgroups because the delegate issues still
# exists and systemd currently does not support the cgroup feature set required
# for containers run by docker
ExecStart=/usr/bin/dockerd -H fd://
ExecReload=/bin/kill -s HUP $MAINPID
LimitNOFILE=1048576
# Having non-zero Limit*s causes performance problems due to accounting overhead
# in the kernel. We recommend using cgroups to do container-local accounting.
LimitNPROC=infinity
LimitCORE=infinity
# Uncomment TasksMax if your systemd version supports it.
# Only systemd 226 and above support this version.
#TasksMax=infinity
TimeoutStartSec=0
# set delegate yes so that systemd does not reset the cgroups of docker containers
Delegate=yes
# kill only the docker process, not all processes in the cgroup
KillMode=process
# restart the docker process if it exits prematurely
Restart=on-failure
StartLimitBurst=3
StartLimitInterval=60s

[Install]
WantedBy=multi-user.target
```

配置好 systemd 后，重新编译，烧写镜像，登陆系统。试用 `systemctl start docker` 启动Docker:  
```
# systemctl start docker
Job for docker.service failed because the control process exited with error code.
See "systemctl status docker.service" and "journalctl -xe" for details.
```

#### 5.1.2 结果分析
启动失败，根据提示，使用 `systemctl status docker.service` 查看状态：  
```
# systemctl status docker.service
● docker.service - Docker Application Container Engine
   Loaded: loaded (/usr/lib/systemd/system/docker.service; enabled; vendor preset: enabled)
   Active: activating (start) since Sun 2018-01-28 18:10:20 UTC; 2s ago
     Docs: https://docs.docker.com
 Main PID: 1330 (dockerd)
   CGroup: /system.slice/docker.service
           ├─1330 /usr/bin/dockerd -H fd://
           └─1335 docker-containerd -l unix:///var/run/docker/libcontainerd/docker-containerd.sock --metrics-interval=0 --start-timeout 2m --state-dir /var/run/docker/libcontainerd/containerd --shim docker-containerd-shim --runtime docker-runc

level=warning msg="Your kernel does not support cgroup blkio throttle.read_bps_device"
level=warning msg="Your kernel does not support cgroup blkio throttle.write_bps_device"
level=warning msg="Your kernel does not support cgroup blkio throttle.read_iops_device"
level=warning msg="Your kernel does not support cgroup blkio throttle.write_iops_device"
level=warning msg="Unable to find cpuset cgroup in mounts"
level=warning msg="mountpoint for pids not found"
level=info msg="Loading containers: start."
level=warning msg="Running modprobe nf_nat failed with message: `modprobe: WARNING: Module nf_nat not found in directory /lib/modules/4.14.67`, error: exit status 1"
level=warning msg="Running modprobe xt_conntrack failed with message: `modprobe: WARNING: Module xt_conntrack not found in directory /lib/modules/4.14.67`, error: exit status 1"
level=warning msg="could not create bridge network for id 2d6e81842f793d6effca9c7a9e34164338971f4f12e3577f063b77645c795427 bridge name docker0 while booting up from persistent state: Failed to program NAT chain: Failed to inject docker in PREROUTING chain: iptables failed: iptables --wait -t nat -A PREROUTING -m addrtype --dst-type LOCAL -j DOCKER: iptables: No chain/target/match by that name.\n (exit status 1)"
```
状态信息包括时间戳，本文删除，但保留信息等级。本着程序员的敏感度，即使是 warning 级别也不能忽略。  
本次问题有：  
* blkio有关的 throttle.read_bps_device 等不支持。  
* cpuset cgroup 未找到。  
* Xtables有关的 nf_nat xt_conntrack未找到。  

#### 5.1.3 解决问题
配置内核，添加 CONFIG_BLK_DEV_THROTTLING=y、CONFIG_NF_NAT=y。  
```
[*] Enable the block layer  ---> 
  [*]   Block layer bio throttling support 

[*] Networking support  --->   
  Networking options  --->  
    [*] Network packet filtering framework (Netfilter)  --->
      IP: Netfilter Configuration  ---> 
        <*> IPv4 connection tracking support (required for NAT)
        <M> IPv4 socket lookup support
        -*- IPv4 nf_tables support
        <*>   IPv4 nf_tables route chain support
        <*>   IPv4 nf_tables packet duplication support
        <*>   nf_tables fib / ip route lookup support
        <*> ARP nf_tables support
        -*- Netfilter IPv4 packet duplication to alternate destination
        <*> ARP packet logging
        {M} IPv4 packet logging
        -*- IPv4 packet rejection
        -*- IPv4 NAT
        <*>   IPv4 nf_tables nat chain support
        -*-   IPv4 masquerade support
        < >   IPv4 masquerading support for nf_tables
        < >   IPv4 redirect support for nf_tables
        <*> IP tables support (required for filtering/masq/NAT)
        <*>   "ah" match support
        <*>   "ecn" match support
        < >   "rpfilter" reverse path filter match support
        <*>   "ttl" match support
        <*>   Packet filtering
        <*>     REJECT target support
        <*>   SYNPROXY target support
        <*>   iptables NAT support  // !!! 这里
        <*>     MASQUERADE target support
        <*>     NETMAP target support
        <*>     REDIRECT target support
        <*>   Packet mangling
        < >     CLUSTERIP target support
        < >     ECN target support
        <*>     "TTL" target support
        < >   raw table support (required for NOTRACK/TRACE)
        < >   Security table
        <*> ARP tables support
        <*>   ARP packet filtering
        <*>   ARP payload mangling
```
注：本次配置忘记了 xt_conntrack。  

### 5.2 第二次

#### 5.2.1 启动
重新编译，烧写镜像，登陆系统。使用 `systemctl start docker` 启动Docker。  

#### 5.2.2 结果分析
出错，信息如下：
```
level=error msg="'overlay' not found as a supported filesystem on this host. Please ensure kernel is new enough and has overlay support loaded."
level=error msg="'overlay' not found as a supported filesystem on this host. Please ensure kernel is new enough and has overlay support loaded."
level=error msg="Failed to built-in GetDriver graph devicemapper /var/lib/docker"
level=info msg="Graph migration to content-addressability took 0.00 seconds"
level=warning msg="Your kernel does not support swap memory limit"
level=warning msg="Your kernel does not support cgroup blkio weight"
level=warning msg="Your kernel does not support cgroup blkio weight_device"
level=warning msg="Unable to find cpuset cgroup in mounts"
level=info msg="Loading containers: start."
level=warning msg="Running modprobe xt_conntrack failed with message: `modprobe: WARNING: Module xt_conntrack not found in directory /lib/modules/4.14.67`, error: exit status 1"
```
本次问题有：  
* blkio有关的 weight_device 等不支持。  
* swap memory limit 不支持。 
* overlay 不支持。  
* cpuset cgroup 未找到。  
* netfilter有关的 xt_conntrack未找到。  

#### 5.2.3 解决问题
配置内核，添加 CONFIG_CFQ_GROUP_IOSCHED=y、CONFIG_SWAP=y、CONFIG_OVERLAY_FS=y、CONFIG_NETFILTER_XT_MATCH_CONNTRACK=y。  
```
[*] Enable the block layer  ---> 
    IO Schedulers  --->  
       <*> CFQ I/O scheduler
       [*]   CFQ Group Scheduling support
       Default I/O scheduler (CFQ)  --->

General setup  ---> 
    [*] Support for paging of anonymous memory (swap) 

[*] Networking support  --->   
  Networking options  --->  
    [*] Network packet filtering framework (Netfilter)  --->
         Core Netfilter Configuration  --->  
           [M]   "conntrack" connection tracking match support 

File systems  ---> 
    <*> Overlay filesystem support 
    [*]   Overlayfs: turn on redirect dir feature by default 
    [*]   Overlayfs: turn on inodes index feature by default
```

注1：本次配置忘记了 cpuset。 
注2：weight_device 在block/cfq-iosched.c文件中定义，需开启宏CONFIG_CFQ_GROUP_IOSCHED。  
注3：Docker 需要使用overlay文件系统。  
注4：xt_conntrack忘记配置，conntrack配置为M。
注5：为避免出错，建议将 ` *** Xtables targets *** `以下的所有选项都编译入内核。
```
*** Xtables targets ***
[*]   AUDIT target support
[*]   CHECKSUM target support
[*]   "CLASSIFY" target support
[*]   "CONNMARK" target support
[*]   "DSCP" and "TOS" target support
-*-   "HL" hoplimit target support
[*]   "HMARK" target support
[*]   IDLETIMER target support
[*]   "LED" target support
[*]   LOG target support
[*]   "MARK" target support
-*-   "SNAT and DNAT" targets support
-*-   "NETMAP" target support
[*]   "NFLOG" target support
[*]   "NFQUEUE" target Support
-*-   "RATEEST" target support
-*-   REDIRECT target support
[*]   "TEE" - packet cloning to alternate destination
[*]   "TPROXY" target transparent proxying support
[*]   "TCPMSS" target support
[*]   "TCPOPTSTRIP" target support
      *** Xtables matches ***
[*]   "addrtype" address type match support
[*]   "bpf" match support
[*]   "control group" match support
[*]   "cluster" match support
[*]   "comment" match support
[*]   "connbytes" per-connection counter match support
[*]   "connlabel" match support
[*]   "connlimit" match support
[*]   "connmark" connection mark match support
[*]   "conntrack" connection tracking match support
[*]   "cpu" match support
[*]   "dccp" protocol match support
[*]   "devgroup" match support
[*]   "dscp" and "tos" match support
-*-   "ecn" match support
[*]   "esp" match support
[*]   "hashlimit" match support
[*]   "helper" match support
-*-   "hl" hoplimit/TTL match support
[*]   "ipcomp" match support
[*]   "iprange" address range match support
[*]   "l2tp" match support
[*]   "length" match support
[*]   "limit" match support
[*]   "mac" address match support
[*]   "mark" match support
[*]   "multiport" Multiple port match support
[*]   "nfacct" match support
[*]   "osf" Passive OS fingerprint match
[*]   "owner" match support
[*]   IPsec "policy" match support
[*]   "physdev" match support
[*]   "pkttype" packet type match support
[*]   "quota" match support
[*]   "rateest" match support
[*]   "realm" match support
[*]   "recent" match support
[*]   "sctp" protocol match support
[*]   "state" match support
[*]   "statistic" match support
[*]   "string" match support
[*]   "tcpmss" match support
[*]   "time" match support
[*]   "u32" match support
```

### 5.3 第三次

#### 5.3.1 启动
重新编译，烧写镜像，登陆系统。启动：  
```
# systemctl start docker
Job for docker.service failed because the control process exited with error code.
See "systemctl status docker.service" and "journalctl -xe" for details.
```
#### 5.3.2 结果分析
```
# systemctl status docker.service
● docker.service - Docker Application Container Engine
   Loaded: loaded (/usr/lib/systemd/system/docker.service; enabled; vendor preset: enabled)
   Active: activating (start) since Sun 2018-01-28 18:08:55 UTC; 1s ago
     Docs: https://docs.docker.com
 Main PID: 1073 (dockerd)
    Tasks: 16 (limit: 1127)
   CGroup: /system.slice/docker.service
           ├─1073 /usr/bin/dockerd -H fd://
           └─1078 docker-containerd -l unix:///var/run/docker/libcontainerd/docker-containerd.sock --metrics-interval=0 --start-timeout 2m --state-dir /var/run/docker/libcontainerd/containerd --shim docker-containerd-shim --runtime docker-runc

Jan 28 18:08:55 buildroot systemd[1]: Starting Docker Application Container Engine...
level=info msg="libcontainerd: new containerd process, pid: 1078"
level=info msg="[graphdriver] using prior storage driver: overlay2"
level=info msg="Graph migration to content-addressability took 0.00 seconds"
level=warning msg="Unable to find cpuset cgroup in mounts"
level=info msg="Loading containers: start."
level=warning msg="Running modprobe xt_conntrack failed with message: `modprobe: WARNING: Module xt_conntrack not found in directory /lib/modules/4.14.67`, error: exit status 1"
```
本次问题有：  
* cpuset 不支持。  
* xt_conntrack 找不到。已经编译为ko，但不知何故，xt_conntrack.ko没有拷贝到板子对应目录。重新编译入内核（见上）。  

#### 5.3.3 解决问题
添加cpuset的支持。CONFIG_CPUSETS=y。 
```
Kernel Features  ---> 
  [*] Symmetric Multi-Processing  // 依赖SMP

General setup  --->
  [*] Control Group support  --->
     [*]   Cpuset controller
     [*]     Include legacy /proc/<pid>/cpuset file
```

### 5.4 第四次
#### 5.4.1 启动
重新编译，烧写镜像，登陆系统。启动：  
```
# systemctl start docker
```
#### 5.4.2 结果分析

```
# systemctl status docker.service
● docker.service - Docker Application Container Engine
   Loaded: loaded (/usr/lib/systemd/system/docker.service; enabled; vendor preset: enabled)
   Active: active (running) since Sat 2019-11-30 19:56:57 +08; 10s ago
     Docs: https://docs.docker.com
 Main PID: 594 (dockerd)
    Tasks: 17 (limit: 1124)
   CGroup: /system.slice/docker.service
           ├─594 /usr/bin/dockerd -H fd://
           └─599 docker-containerd -l unix:///var/run/docker/libcontainerd/docker-containerd.sock --metrics-interval=0 --start-timeout 2m --state-dir /var/run/docker/libcontainerd/containerd --shim docker-containerd-shim --runtime docker-runc

level=info msg="Graph migration to content-addressability took 0.00 seconds"
level=info msg="Loading containers: start."
level=info msg="Default bridge (docker0) is assigned with an IP address 172.17.0.0/16. Daemon option --bip can be used to set a preferred IP address"
level=info msg="Loading containers: done."
level=warning msg="failed to retrieve docker-runc version: unknown output format: runc version commit: 9c2d8d184e5da67c95d601382adf14862e4f2228\nspec: 1.0.0-rc2-dev\n"
level=warning msg="failed to retrieve docker-init version: exec: \"docker-init\": executable file not found in $PATH"
level=info msg="Daemon has completed initialization"
level=info msg="Docker daemon" commit=89658be graphdriver=overlay2 version=17.05.0-ce
buildroot systemd[1]: Started Docker Application Container Engine. level=info msg="API listen on /var/run/docker.sock"
```
**Docker服务启动成功。**  

## 六、拉取镜像
### 6.1 第一次
#### 6.1.1 拉取镜像
Dockerhub 上有arm版本的busybox镜像提供下载，拉取之：
```
# docker pull armhf/busybox
Using default tag: latest
Error response from daemon: Get https://registry-1.docker.io/v2/: x509: failed to load system roots and no roots provided
```

#### 6.1.2 结果分析
从 https 和 x509 猜测是证书方面的原因。需要加上ca-certificates。  
（题外话：ubuntu一般已安装，如否，安装之：sudo apt-get install -y ca-certificates）

#### 6.1.3 问题解决
在 buildroot 添加 CA 支持：
```
Target packages
  -> Libraries
     -> Crypto 
        [*] CA Certificates 
```

### 6.2 第二次
#### 6.2.1 拉取镜像
```
# docker pull armhf/busybox
Using default tag: latest
Error response from daemon: Get https://registry-1.docker.io/v2/: x509: certificate has expired or is not yet valid
```
#### 6.2.2 结果分析
提示信息为证书过期，原因是板子的时间不正确。  

#### 6.2.3 问题解决
先看板子上时间和时区：
```
# date
Thu Jan  4 12:40:00 UTC 2018  // 时间错误
# ls -lh /etc/localtime  // UTC时间
lrwxrwxrwx    1 root     root          29 Nov 27  2019 /etc/localtime -> ../usr/share/zoneinfo/Etc/UTC
```
改为东八区（GMT-8），并设置为当前时间：  
```
# ln -s ../usr/share/zoneinfo/Etc/GMT-8 /etc/localtime
# date -s '2019-11-30 22:34'
```

重新尝试。
```
# docker pull armhf/busybox
Using default tag: latest
latest: Pulling from armhf/busybox
d34a655120f5: Pull complete 
Digest: sha256:8e51389cdda2158935f2b231cd158790c33ae13288c3106909324b061d24d6d1
Status: Downloaded newer image for armhf/busybox:latest
```
**成功拉取镜像。**

## 七、运行镜像
### 7.1 第一次
#### 7.1.1 运行
运行容器：  
```
# docker run --name busybox -it armhf/busybox sh     
docker: Error response from daemon: failed to create endpoint busybox on network bridge: failed to add the host (vethb7b8cb4) <=> sandbox (veth9baa1ae) pair interfaces: operation not supported.
```
#### 7.1.2 结果分析
使用 `docker ps -a` 查看状态，为 Created（但不是 Up 状态）：  
```
# docker ps -a
CONTAINER ID        IMAGE               COMMAND             CREATED             STATUS              PORTS               NAMES
d98ede1ba748        armhf/busybox       "sh"                7 seconds ago       Created                                 busybox
// 删除之
# docker rm busybox
busybox
```
查看 Docker 网络：
```
# docker network ls       
NETWORK ID          NAME                DRIVER              SCOPE
606c3e2fd95b        bridge              bridge              local
702e4dd6184e        host                host                local
8341311d1332        none                null                local
```
#### 7.1.3 问题解决
尝试清除：
```
docker network prune
docker system prune
systemctl restart docker // 或重启系统
```
再次运行，依旧失败。

在虚拟机运行 Docker 容器，使用 ifconfig 可看到如 veth2e1af7a 设备。转而猜测内核未配置，搜索关键字为 veth，看到 CONFIG_VETH 未被配置。配置：    
```
Device Drivers
  -> Network device support
    -> [*]   Network core driver support
    -> <*>   Virtual ethernet pair device
```

### 7.2 第二次
#### 7.2.1 运行
```
# docker run --name busybox -itd armhf/busybox sh
97071b6f98d8e3f2c787d61bfb9c0246376d2e2f6e4538ace33576d1b9ed2aef
```
无报错。使用 `ocker ps` 查看状态：  
```
# docker ps
CONTAINER ID        IMAGE               COMMAND             CREATED             STATUS              PORTS               NAMES
97071b6f98d8        armhf/busybox       "sh"                13 seconds ago      Up 7 seconds                            busybox
```
进入容器：  
```
# docker exec -it busybox sh
```
查看版本：  
```
/ # uname -a
Linux 97071b6f98d8 4.14.100 #250 SMP PREEMPT Sat Nov 30 23:59:47 CST 2019 armv7l GNU/Linux
```

**到此，Docker 在ARM系统上搭建成功。**

## 八、优化
本节修改 Docker 镜像存储目录，以及加速 Docker 镜像下载速度。  
先停止 Docker： 
```
systemctl stop docker
```
修改 /lib/systemd/system/docker.service 文件，在 ExecStart 命令后追加 `--graph <目录>`，示例：  
```
ExecStart=/usr/bin/dockerd -H fd:// --graph /mnt/docker
```

使用如下命令生成 /etc/docker/daemon.json 文件：  
```
echo -e "{
  "registry-mirrors": [
    "https://a8qh6yqv.mirror.aliyuncs.com",
    "http://hub-mirror.c.163.com"
  ]
}" > /etc/docker/daemon.json
```

重新加载配置文件并启动 Docker 服务：
```
# systemctl daemon-reload  // 必须调用此命令，否则docker.service不生效
# systemctl start docker
```

## 附、杂事
做ARM开发，十分考验人的耐性和技能，但也能提高人的耐性和技能。Docker出错提示的信息如“挤牙膏”，只有解决一部分，才会显出一部分，如此反复，此过程需要编译、升级，等，十分耗时。  
细节十分重要。似乎无关联的事物，往往有联系。有些小地方不注意，就无法进行。如板子时间不正确，导致Dcoker镜像无法下载。  
