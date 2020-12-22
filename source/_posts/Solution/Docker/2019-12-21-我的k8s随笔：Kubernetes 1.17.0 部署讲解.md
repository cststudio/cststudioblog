---
title: Kubernetes 1.17.0 部署讲解
urlname: k8s-deploy-1.17.0-detail
tags:
  - kubernetes
categories:
  - Solution
photos: Kubernetes-logo.png
date: 2019-12-21 00:30:10
---

k8s 集群部署过程实践笔记共两种版本：一为专注部署操作，一为涉及部署操作讲解。本文为后者。  
本文介绍了如何在两台 ubuntu 16.04 64 bit 双核 CPU 虚拟机上使用 kubeadm 部署 Kubernetes 1.17.0 集群的过程，网络插件为 flannel v0.11.0，镜像源为阿里云。本文具有一定实践参考意义。

<!-- more -->

## 一、 环境

两台 ubuntu 16.04 64 bit，2GB 内存，双核 CPU。  
环境要求和设置：  
两主机，一为 master，一为 node。master 主机名称为 ubuntu。node 主机名称为 node。操作系统的主机名称要确保不同。  
工程目录为：\$HOME/k8s。  
所有操作使用 root 权限执行（注：理论上普通用户亦可，为避免权限问题，故出此下策）。  
注意，k8s 要求机器的 CPU 必须双核心以上。  
本文部署的 k8s 版本为 1.17.0。部署日期约 2019 年 12 月中旬~下旬，请注意时效性。  
本文部署镜像及版本如下：

```
k8s.gcr.io/kube-apiserver:v1.17.0
k8s.gcr.io/kube-controller-manager:v1.17.0
k8s.gcr.io/kube-scheduler:v1.17.0
k8s.gcr.io/kube-proxy:v1.17.0
k8s.gcr.io/pause:3.1
k8s.gcr.io/etcd:3.4.3-0
k8s.gcr.io/coredns:1.6.5
quay.io/coreos/flannel:v0.11.0-amd64
```

注： k8s.gcr.io 使用阿里云镜像地址 registry.aliyuncs.com/google_containers 替换。

## 二、 安装 docker

```
apt-get install docker.io
```

执行如下命令新建 /etc/docker/daemon.json 文件：

```
cat > /etc/docker/daemon.json <<-EOF
{
  "registry-mirrors": [
    "https://a8qh6yqv.mirror.aliyuncs.com",
    "http://hub-mirror.c.163.com"
  ],
  "exec-opts": ["native.cgroupdriver=systemd"]
}
EOF

```

释义：  
registry-mirrors 为镜像加速器地址。  
native.cgroupdriver=systemd 表示使用的 cgroup 驱动为 systemd（k8s 使用此方式），默认为 cgroupfs。修改原因是 kubeadm.conf 中修改 k8s 的驱动方式不成功。

重启 docker，查看 cgroup：

```
# systemctl restart docker
# docker info | grep -i cgroup
Cgroup Driver: systemd
```

出现 systemd 表示修改成功。

## 三、部署 k8s master 主机

k8s 的部署分 master 主机和 node 节点。本节为 master 主机。

### 3.1 关闭 swap

编辑 /etc/fstab 文件，注释掉 swap 分区挂载的行，示例：

```
# swap was on /dev/sda5 during installation
UUID=aaa38da3-6e60-4e9d-bfc6-7128fd05f1c7 none swapsw  0  0
```

再执行：

```
# swapoff -a
```

### 3.2 添加国内 k8s 源

此处选择阿里云的：

```
# cat <<EOF > /etc/apt/sources.list.d/kubernetes.list
deb https://mirrors.aliyun.com/kubernetes/apt/ kubernetes-xenial main
EOF

```

添加 key：

```
# cat https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
```

如不成功，则先通过一些方法下载：https://packages.cloud.google.com/apt/doc/apt-key.gpg ，放到工程目录。再执行：

```
# cat apt-key.gpg | sudo apt-key add -
```

注：可以使用地址 https://www.cststudio.com.cn/dl/apt-key.gpg 下载（截至 2019 年 12 月 31 号有效）。

### 3.3 更新源

```
# apt-get update
```

安装 kubeadm、kubectl、kubelet、kubernetes-cni 等工具。

```
# apt-get install -y kubeadm kubectl kubelet kubernetes-cni
```

注 1：安装 kubeadm 会自动安装 kubectl、kubelet 和 kubernetes-cni，故只指定 kubeadm 亦可。  
注 2：本文安装时，得到的版本为 1.17.0，kubernetes-cni 为 0.7.5。下载文件位于 /var/cache/apt/archives/ 目录中。

### 3.4 获取部署所需的镜像版本

```
# kubeadm config images list
```

输出如下：

```
W1214 08:46:14.303158    8461 version.go:101] could not fetch a Kubernetes version from the internet: unable to get URL "https://dl.k8s.io/release/stable-1.txt": Get https://dl.k8s.io/release/stable-1.txt: net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
W1214 08:46:14.303772    8461 version.go:102] falling back to the local client version: v1.17.0
W1214 08:46:14.304223    8461 validation.go:28] Cannot validate kube-proxy config - no validator is available
W1214 08:46:14.304609    8461 validation.go:28] Cannot validate kubelet config - no validator is available
k8s.gcr.io/kube-apiserver:v1.17.0
k8s.gcr.io/kube-controller-manager:v1.17.0
k8s.gcr.io/kube-scheduler:v1.17.0
k8s.gcr.io/kube-proxy:v1.17.0
k8s.gcr.io/pause:3.1
k8s.gcr.io/etcd:3.4.3-0
k8s.gcr.io/coredns:1.6.5
```

前面提示的警告信息可不理会。此处是确认**本版本 kubeadm 匹配的镜像的版本**，因为各组件版本不同可能出现兼容性问题。

### 3.5 拉取镜像文件。

一般地，国内无法直接下载 k8s.gcr.io 的镜像。方式有二：
1、在初始化 k8s 时，使用阿里云镜像地址，此地址可以顺利下载，见下初始化。  
2、自行下载好前述镜像。使用如下脚本 pullk8s.sh（注意脚本必须添加 x 属性）：

```
#!/bin/bash
# 下面的镜像应该去除"k8s.gcr.io/"的前缀，版本换成kubeadm config images list命令获取到的版本
images=(
    kube-apiserver:v1.17.0
    kube-controller-manager:v1.17.0
    kube-scheduler:v1.17.0
    kube-proxy:v1.17.0
    pause:3.1
    etcd:3.4.3-0
    coredns:1.6.5
)

for imageName in ${images[@]} ; do
    docker pull registry.cn-hangzhou.aliyuncs.com/google_containers/$imageName
    docker tag registry.cn-hangzhou.aliyuncs.com/google_containers/$imageName k8s.gcr.io/$imageName
    docker rmi registry.cn-hangzhou.aliyuncs.com/google_containers/$imageName
done
```

拉取：

```
chmod +x pullk8s.sh
bash pullk8s.sh  (或 ./pullk8s.sh)
```

### 3.6 网络

设置网络配置：

```
mkdir -p /etc/cni/net.d

cat >/etc/cni/net.d/10-mynet.conf <<-EOF
{
    "cniVersion": "0.3.0",
    "name": "mynet",
    "type": "bridge",
    "bridge": "cni0",
    "isGateway": true,
    "ipMasq": true,
    "ipam": {
        "type": "host-local",
        "subnet": "10.244.0.0/16",
        "routes": [
            {"dst": "0.0.0.0/0"}
        ]
    }
}
EOF

cat >/etc/cni/net.d/99-loopback.conf <<-EOF
{
    "cniVersion": "0.3.0",
    "type": "loopback"
}
EOF

```

**经实践，此步骤不做亦可。**

### 3.7 下载 flannel 镜像

```
docker pull quay.io/coreos/flannel:v0.11.0-amd64
```

注：如果无法下载，需要使用其它方法。
flannel 镜像信息：

```
# docker images | grep flannel
quay.io/coreos/flannel   v0.11.0-amd64 ff281650a721 11 months ago 52.6MB
```

### 3.8 初始化

版本一：

```
kubeadm init --pod-network-cidr=10.244.0.0/16 \
  --image-repository registry.aliyuncs.com/google_containers
```

释义：  
--pod-network-cidr 指定了网络段，后续网络插件会使用到（本文使用 flannel）。  
--image-repository 指定了镜像地址，默认为 k8s.gcr.io，此处指定为阿里云镜像地址 registry.aliyuncs.com/google_containers。  
注意，其它参数默认。

上述命令等同如下命令：

```
kubeadm init \
  --apiserver-advertise-address=192.168.0.102 \
  --image-repository registry.aliyuncs.com/google_containers \
  --kubernetes-version v1.17.0 \
  --service-cidr=10.1.0.0/16\
  --pod-network-cidr=10.244.0.0/16
```

版本二，根据前文脚本自行拉取版本：

```
kubeadm init --pod-network-cidr=10.244.0.0/16
```

**本文使用版本一部署**。

初始化过程的提示信息如下：

```
W1221 17:44:19.880281    2865 version.go:101] could not fetch a Kubernetes version from the internet: unable to get URL "https://dl.k8s.io/release/stable-1.txt": Get https://dl.k8s.io/release/stable-1.txt: net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
W1221 17:44:19.880405    2865 version.go:102] falling back to the local client version: v1.17.0
W1221 17:44:19.880539    2865 validation.go:28] Cannot validate kube-proxy config - no validator is available
W1221 17:44:19.880546    2865 validation.go:28] Cannot validate kubelet config - no validator is available
[init] Using Kubernetes version: v1.17.0
[preflight] Running pre-flight checks
[preflight] Pulling images required for setting up a Kubernetes cluster
[preflight] This might take a minute or two, depending on the speed of your internet connection
[preflight] You can also perform this action in beforehand using 'kubeadm config images pull'
[kubelet-start] Writing kubelet environment file with flags to file "/var/lib/kubelet/kubeadm-flags.env"
[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"
[kubelet-start] Starting the kubelet
[certs] Using certificateDir folder "/etc/kubernetes/pki"
[certs] Generating "ca" certificate and key
[certs] Generating "apiserver" certificate and key
[certs] apiserver serving cert is signed for DNS names [ubuntu kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.cluster.local] and IPs [10.96.0.1 192.168.0.102]
[certs] Generating "apiserver-kubelet-client" certificate and key
[certs] Generating "front-proxy-ca" certificate and key
[certs] Generating "front-proxy-client" certificate and key
[certs] Generating "etcd/ca" certificate and key
[certs] Generating "etcd/server" certificate and key
[certs] etcd/server serving cert is signed for DNS names [ubuntu localhost] and IPs [192.168.0.102 127.0.0.1 ::1]
[certs] Generating "etcd/peer" certificate and key
[certs] etcd/peer serving cert is signed for DNS names [ubuntu localhost] and IPs [192.168.0.102 127.0.0.1 ::1]
[certs] Generating "etcd/healthcheck-client" certificate and key
[certs] Generating "apiserver-etcd-client" certificate and key
[certs] Generating "sa" key and public key
[kubeconfig] Using kubeconfig folder "/etc/kubernetes"
[kubeconfig] Writing "admin.conf" kubeconfig file
[kubeconfig] Writing "kubelet.conf" kubeconfig file
[kubeconfig] Writing "controller-manager.conf" kubeconfig file
[kubeconfig] Writing "scheduler.conf" kubeconfig file
[control-plane] Using manifest folder "/etc/kubernetes/manifests"
[control-plane] Creating static Pod manifest for "kube-apiserver"
[control-plane] Creating static Pod manifest for "kube-controller-manager"
W1221 17:50:12.262505    2865 manifests.go:214] the default kube-apiserver authorization-mode is "Node,RBAC"; using "Node,RBAC"
[control-plane] Creating static Pod manifest for "kube-scheduler"
W1221 17:50:12.268198    2865 manifests.go:214] the default kube-apiserver authorization-mode is "Node,RBAC"; using "Node,RBAC"
[etcd] Creating static Pod manifest for local etcd in "/etc/kubernetes/manifests"
[wait-control-plane] Waiting for the kubelet to boot up the control plane as static Pods from directory "/etc/kubernetes/manifests". This can take up to 4m0s
[apiclient] All control plane components are healthy after 17.504683 seconds
[upload-config] Storing the configuration used in ConfigMap "kubeadm-config" in the "kube-system" Namespace
[kubelet] Creating a ConfigMap "kubelet-config-1.17" in namespace kube-system with the configuration for the kubelets in the cluster
[upload-certs] Skipping phase. Please see --upload-certs
[mark-control-plane] Marking the node ubuntu as control-plane by adding the label "node-role.kubernetes.io/master=''"
[mark-control-plane] Marking the node ubuntu as control-plane by adding the taints [node-role.kubernetes.io/master:NoSchedule]
[bootstrap-token] Using token: 1rpp8b.axfud1xrsvx4q8nw
[bootstrap-token] Configuring bootstrap tokens, cluster-info ConfigMap, RBAC Roles
[bootstrap-token] configured RBAC rules to allow Node Bootstrap tokens to post CSRs in order for nodes to get long term certificate credentials
[bootstrap-token] configured RBAC rules to allow the csrapprover controller automatically approve CSRs from a Node Bootstrap Token
[bootstrap-token] configured RBAC rules to allow certificate rotation for all node client certificates in the cluster
[bootstrap-token] Creating the "cluster-info" ConfigMap in the "kube-public" namespace
[kubelet-finalize] Updating "/etc/kubernetes/kubelet.conf" to point to a rotatable kubelet client certificate and key
[addons] Applied essential addon: CoreDNS
[addons] Applied essential addon: kube-proxy

Your Kubernetes control-plane has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

Then you can join any number of worker nodes by running the following on each as root:

kubeadm join 192.168.0.102:6443 --token 1rpp8b.axfud1xrsvx4q8nw \
    --discovery-token-ca-cert-hash sha256:6bf952d45bbdc121fa90583eac33f11f0a3f4b491f29996a56fc289363843e3c
```

首先确认了 k8s 版本。  
接着创建配置文件，如证书等。  
再创建 pod。  
最后提示加入集群的命令。  
部署时不建议深入了解 k8s 概念。

如果忘记，可 kubeadm token create --print-join-command 查看，示例如下：

```
W1221 21:23:37.632172    5479 validation.go:28] Cannot validate kube-proxy config - no validator is available
W1221 21:23:37.632503    5479 validation.go:28] Cannot validate kubelet config - no validator is available
kubeadm join 192.168.0.102:6443 --token r9ip8i.9rs35l98nj3cquey     --discovery-token-ca-cert-hash sha256:6bf952d45bbdc121fa90583eac33f11f0a3f4b491f29996a56fc289363843e3c
```

根据提示，根据拷贝 admin.conf 文件到当前用户相应目录下。admin.conf 文件后续会使用到（需要拷贝到 node 节点）。

```
# mkdir -p $HOME/.kube
# sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
# sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

初始化时，如不存在则自动下载镜像，初始化后镜像如下：

```
# docker images
REPOSITORY                                                        TAG                 IMAGE ID            CREATED             SIZE
registry.aliyuncs.com/google_containers/kube-proxy                v1.17.0             7d54289267dc        13 days ago         116MB
registry.aliyuncs.com/google_containers/kube-apiserver            v1.17.0             0cae8d5cc64c        13 days ago         171MB
registry.aliyuncs.com/google_containers/kube-controller-manager   v1.17.0             5eb3b7486872        13 days ago         161MB
registry.aliyuncs.com/google_containers/kube-scheduler            v1.17.0             78c190f736b1        13 days ago         94.4MB
registry.aliyuncs.com/google_containers/coredns                   1.6.5               70f311871ae1        6 weeks ago         41.6MB
registry.aliyuncs.com/google_containers/etcd                      3.4.3-0             303ce5db0e90        8 weeks ago         288MB
registry.aliyuncs.com/google_containers/pause                     3.1                 da86e6ba6ca1        2 years ago         742kB
```

此时 pod 状态如下：

```
# kubectl get pods -n kube-system
NAME                             READY   STATUS    RESTARTS   AGE
coredns-9d85f5447-67qtv          0/1     Pending   0          3h26m
coredns-9d85f5447-cg87c          0/1     Pending   0          3h26m
etcd-ubuntu                      1/1     Running   0          3h27m
kube-apiserver-ubuntu            1/1     Running   0          3h27m
kube-controller-manager-ubuntu   1/1     Running   0          3h27m
kube-proxy-chqbq                 1/1     Running   0          3h26m
kube-scheduler-ubuntu            1/1     Running   0          3h27m
```

除 coredns 状态为 Pending 外，其它 pod 均运行。这是因为没有部署网络插件导致的。本文选用 flannel 。

### 3.9 部署 flannel

执行如下命令部署 flannel：

```
# kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
```

释义：  
使用 flannel 仓库的 kube-flannel.yml 文件部署。详细可参考该文件。  
如果无法访问，则可手动下载 https://github.com/coreos/flannel/blob/master/Documentation/kube-flannel.yml 文件到当前目录，再执行 `kubectl apply -f kube-flannel.yml` 命令。

```
# kubectl apply -f kube-flannel.yml
podsecuritypolicy.policy/psp.flannel.unprivileged created
clusterrole.rbac.authorization.k8s.io/flannel created
clusterrolebinding.rbac.authorization.k8s.io/flannel created
serviceaccount/flannel created
configmap/kube-flannel-cfg created
daemonset.apps/kube-flannel-ds-amd64 created
daemonset.apps/kube-flannel-ds-arm64 created
daemonset.apps/kube-flannel-ds-arm created
daemonset.apps/kube-flannel-ds-ppc64le created
daemonset.apps/kube-flannel-ds-s390x created
```

注：也可以用 kube-flannel-aliyun.yml，速度会快些，但有个 "extensions/v1beta1" 标志，当前版本不支持（原因未深究），故不能使用。  
部署 flannel 时如 flannel 镜像不存在会自动下载，前文已下载，故启动较快。启动过程中，flannel 状态变化如下：

```
kube-flannel-ds-amd64-pjj5k  0/1  Init:0/1   0  3s
kube-flannel-ds-amd64-pjj5k  1/1  Running    0  9s
```

这个步骤会创建 cni0 和 flannel.1 网络设备，稍后会列出信息。  
部署 flannel 时，coredns 状态变化如下：

```
coredns-9d85f5447-67qtv  0/1 Pending            0  3h43m
coredns-9d85f5447-67qtv  0/1 ContainerCreating  0  3h43m
coredns-9d85f5447-67qtv  0/1 CrashLoopBackOff   2  3h44m
```

查看该 pod 日志：

```
# kubectl logs coredns-9d85f5447-67qtv -n kube-system
.:53
[INFO] plugin/reload: Running configuration MD5 = 4e235fcc3696966e76816bcd9034ebc7
CoreDNS-1.6.5
linux/amd64, go1.13.4, c2fd1b2
[FATAL] plugin/loop: Loop (127.0.0.1:40392 -> :53) detected for zone ".", see https://coredns.io/plugins/loop#troubleshooting. Query: "HINFO 1045765417707038110.4695109258766463637."
```

原因是 coredns 的域名解析有问题。修改 coredns 的 ConfigMap：

```
kubectl edit cm coredns -n kube-system
```

默认使用 VIM 编辑，删除 loop 字段的那一行（用 dd 命令）。再输入 `:wq` 保存退出。  
coredns ConfigMap 内容如下：

```
apiVersion: v1
data:
  Corefile: |
    .:53 {
        errors
        health {
           lameduck 5s
        }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
           pods insecure
           fallthrough in-addr.arpa ip6.arpa
           ttl 30
        }
        prometheus :9153
        forward . /etc/resolv.conf
        cache 30
        loop
        reload
        loadbalance
    }
kind: ConfigMap
metadata:
  creationTimestamp: "2019-12-21T09:50:31Z"
  name: coredns
  namespace: kube-system
  resourceVersion: "171"
  selfLink: /api/v1/namespaces/kube-system/configmaps/coredns
  uid: 62485b55-3de6-4dee-b24a-8440052bdb66
```

注：理论上修改 /etc/resolv.conf 为 8.8.8.8 应该能解决，但该文件手动修改重启后恢复为 127 网段，无效。删除 loop 字段可解决问题。

删除出问题的**所有的** coredns：

```
# kubectl delete pod coredns-9d85f5447-67qtv coredns-9d85f5447-cg87c  -n kube-system
pod "coredns-9d85f5447-67qtv" deleted
pod "coredns-9d85f5447-cg87c" deleted
```

删除后，coredns 会自动重启。再查看 pod：

```
# kubectl get pod -n kube-system
NAME                             READY   STATUS    RESTARTS   AGE
coredns-9d85f5447-bhf24          1/1     Running   0          10s
coredns-9d85f5447-smgz9          1/1     Running   0          10s
etcd-ubuntu                      1/1     Running   0          3h58m
kube-apiserver-ubuntu            1/1     Running   0          3h58m
kube-controller-manager-ubuntu   1/1     Running   0          3h58m
kube-flannel-ds-amd64-pjj5k      1/1     Running   0          14m
kube-proxy-chqbq                 1/1     Running   0          3h57m
kube-scheduler-ubuntu            1/1     Running   0          3h58m
```

全部 pod 已全部运行。  
注：也可以先修改 ConfigMap，再部署 flannel。

**至此，master 节点已部署成功**。

查看 flannel 网络信息：

```
# cat /run/flannel/subnet.env
FLANNEL_NETWORK=10.244.0.0/16
FLANNEL_SUBNET=10.244.0.1/24
FLANNEL_MTU=1450
FLANNEL_IPMASQ=true
```

查看本机 IP 信息：

```
# ifconfig
cni0      Link encap:Ethernet  HWaddr 3e:ce:1f:4a:67:d3
          inet addr:10.244.0.1  Bcast:0.0.0.0  Mask:255.255.255.0
          inet6 addr: fe80::3cce:1fff:fe4a:67d3/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1450  Metric:1
          RX packets:269112 errors:0 dropped:0 overruns:0 frame:0
          TX packets:303520 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:18543053 (18.5 MB)  TX bytes:87215483 (87.2 MB)

docker0   Link encap:Ethernet  HWaddr 02:42:e4:10:57:4a
          inet addr:172.17.0.1  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST MULTICAST  MTU:1500  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

ens33     Link encap:Ethernet  HWaddr 00:0c:29:f4:c1:06
          inet addr:192.168.0.102  Bcast:192.168.0.255  Mask:255.255.255.0
          inet6 addr: fe80::49d4:fd5c:17ef:d637/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:202896 errors:0 dropped:0 overruns:0 frame:0
          TX packets:183666 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:27411397 (27.4 MB)  TX bytes:183832306 (183.8 MB)

flannel.1 Link encap:Ethernet  HWaddr aa:2a:8b:e7:92:2b
          inet addr:10.244.0.0  Bcast:0.0.0.0  Mask:255.255.255.255
          UP BROADCAST RUNNING MULTICAST  MTU:1450  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:38 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)
```

查看 flannel 网络配置：

```
# cat /etc/cni/net.d/10-flannel.conflist
{
  "name": "cbr0",
  "cniVersion": "0.3.1",
  "plugins": [
    {
      "type": "flannel",
      "delegate": {
        "hairpinMode": true,
        "isDefaultGateway": true
      }
    },
    {
      "type": "portmap",
      "capabilities": {
        "portMappings": true
      }
    }
  ]
}
```

（存疑：此处 cni 版本为 0.3.1，与之前看到的 cni 版本不一致。待研究）

## 四、node 节点

k8s 的部署分 master 主机和 node 节点。本节为 node 节点。

### 4.1 前置条件

在 node 节点上操作。  
1、安装 kubeadm，见前述。  
2、下载 flannel 镜像，见前述（如果不预先下载，在加入集群时会自动下载）。  
3、将主机的 /etc/kubernetes/admin.conf 文件拷贝到 node 节点的 /etc/kubernetes/ 目录。（注：在　 master 节点使用 scp 命令即可，kubernetes 不存在自行创建）

### 4.2 加入集群

此时，k8s 服务还没有启动。执行如下命令以加入节点：

```
kubeadm join 192.168.0.102:6443 --token 1rpp8b.axfud1xrsvx4q8nw \
    --discovery-token-ca-cert-hash sha256:6bf952d45bbdc121fa90583eac33f11f0a3f4b491f29996a56fc289363843e3c
```

提示信息如下：

```
[preflight] WARNING: JoinControlPane.controlPlane settings will be ignored when control-plane flag is not set.
[preflight] Running pre-flight checks
[preflight] Reading configuration from the cluster...
[preflight] FYI: You can look at this config file with 'kubectl -n kube-system get cm kubeadm-config -oyaml'
[kubelet-start] Downloading configuration for the kubelet from the "kubelet-config-1.17" ConfigMap in the kube-system namespace
[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"
[kubelet-start] Writing kubelet environment file with flags to file "/var/lib/kubelet/kubeadm-flags.env"
[kubelet-start] Starting the kubelet
[kubelet-start] Waiting for the kubelet to perform the TLS Bootstrap...


This node has joined the cluster:
* Certificate signing request was sent to apiserver and a response was received.
* The Kubelet was informed of the new secure connection details.

Run 'kubectl get nodes' on the control-plane to see this node join the cluster.
```

加入群集过程中会下载必须的 k8s 镜像，注意，master 主机已经指定为阿里源的源，所以 node 节点上亦是该源。

```
REPOSITORY                                           TAG                 IMAGE ID            CREATED             SIZE
registry.aliyuncs.com/google_containers/kube-proxy   v1.17.0             7d54289267dc        2 weeks ago         116MB
registry.aliyuncs.com/google_containers/coredns      1.6.5               70f311871ae1        7 weeks ago         41.6MB
quay.io/coreos/flannel                               v0.11.0-amd64       ff281650a721        11 months ago       52.6MB
registry.aliyuncs.com/google_containers/pause        3.1                 da86e6ba6ca1        2 years ago         742kB
```

成功加入后，本节点有如下相关服务在运行：

```
# ps aux | grep kube
root       3269  1.6  4.2 754668 86784 ?        Ssl  Dec20  18:34 /usr/bin/kubelet --bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubelet.conf --kubeconfig=/etc/kubernetes/kubelet.conf --config=/var/lib/kubelet/config.yaml --cgroup-driver=cgroupfs --network-plugin=cni --pod-infra-container-image=registry.aliyuncs.com/google_containers/pause:3.1
root       3632  0.1  1.1 140104 22412 ?        Ssl  Dec20   2:14 /usr/local/bin/kube-proxy --config=/var/lib/kube-proxy/config.conf --hostname-override=node
root       4385  0.0  1.6 407356 33704 ?        Ssl  Dec20   0:51 /opt/bin/flanneld --ip-masq --kube-subnet-mgr
root     121292  0.0  0.0  14228  1032 pts/0    S+   00:33   0:00 grep --color=auto kube
```

主要有 kubelet、kube-proxy、flanneld，等。

docker 容器列表如下：

```
# docker ps
CONTAINER ID        IMAGE                                                COMMAND                  CREATED             STATUS              PORTS               NAMES
2fde9bb78fd7        ff281650a721                                         "/opt/bin/flanneld -…"   7 minutes ago       Up 7 minutes                            k8s_kube-flannel_kube-flannel-ds-amd64-28p6z_kube-system_f40a2875-70eb-468b-827d-fcb59be3416b_1
aa7ca3d5825e        registry.aliyuncs.com/google_containers/kube-proxy   "/usr/local/bin/kube…"   8 minutes ago       Up 8 minutes                            k8s_kube-proxy_kube-proxy-n6xv5_kube-system_3df8b7ae-e5b8-4256-9857-35bd24f7e025_0
ac61ed8d7295        registry.aliyuncs.com/google_containers/pause:3.1    "/pause"                 8 minutes ago       Up 8 minutes                            k8s_POD_kube-flannel-ds-amd64-28p6z_kube-system_f40a2875-70eb-468b-827d-fcb59be3416b_0
423f9e42c082        registry.aliyuncs.com/google_containers/pause:3.1    "/pause"                 8 minutes ago       Up 8 minutes                            k8s_POD_kube-proxy-n6xv5_kube-system_3df8b7ae-e5b8-4256-9857-35bd24f7e025_0
```

查看 flannel 网络信息：

```
# cat /run/flannel/subnet.env
FLANNEL_NETWORK=10.244.0.0/16
FLANNEL_SUBNET=10.244.1.1/24
FLANNEL_MTU=1450
FLANNEL_IPMASQ=true
```

查看本机 IP 信息：

```
# ifconfig
cni0      Link encap:Ethernet  HWaddr 7a:0b:d3:cc:9c:c2
          inet addr:10.244.1.1  Bcast:0.0.0.0  Mask:255.255.255.0
          inet6 addr: fe80::780b:d3ff:fecc:9cc2/64 Scope:Link
          UP BROADCAST MULTICAST  MTU:1500  Metric:1
          RX packets:3 errors:0 dropped:0 overruns:0 frame:0
          TX packets:136 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:84 (84.0 B)  TX bytes:15701 (15.7 KB)

docker0   Link encap:Ethernet  HWaddr 02:42:2a:72:1c:91
          inet addr:172.17.0.1  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST MULTICAST  MTU:1500  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)

ens33     Link encap:Ethernet  HWaddr 00:0c:29:96:3c:7a
          inet addr:192.168.0.140  Bcast:192.168.0.255  Mask:255.255.255.0
          inet6 addr: fe80::a5e3:6e8d:8330:34db/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:815745 errors:0 dropped:0 overruns:0 frame:0
          TX packets:280001 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000
          RX bytes:884087449 (884.0 MB)  TX bytes:25231812 (25.2 MB)

flannel.1 Link encap:Ethernet  HWaddr ae:98:ae:9b:ae:ef
          inet addr:10.244.1.0  Bcast:0.0.0.0  Mask:255.255.255.255
          UP BROADCAST RUNNING MULTICAST  MTU:1450  Metric:1
          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
          TX packets:0 errors:0 dropped:60 overruns:0 carrier:0
          collisions:0 txqueuelen:0
          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)
```

## 五、验证

在 master 节点执行：

```
# kubectl get nodes
NAME     STATUS   ROLES    AGE     VERSION
node     Ready    <none>   17m     v1.17.0
ubuntu   Ready    master   5h11m   v1.17.0
```

可以看到两台机器已为 Ready 状态。node 机器由 NotReady 变为 Ready，耗时大约 10 余秒。

使用 busybox 镜像简单测试 pod。在 master 节点执行：

```
# kubectl run -i --tty busybox --image=latelee/busybox --restart=Never -- sh
```

稍等片刻，即可进入 busybox 命令行：

```
If you don't see a command prompt, try pressing enter.
/ #
/ #
/ # uname -a
Linux busybox 4.4.0-21-generic #37-Ubuntu SMP Mon Apr 18 18:33:37 UTC 2016 x86_64 GNU/Linux
```

另起命令行，查看 pod 运行状态：

```
# kubectl get pod -o wide
NAME      READY   STATUS    RESTARTS   AGE   IP           NODE   NOMINATED NODE   READINESS GATES
busybox   1/1     Running   0          74s   10.244.1.4   node   <none>           <none>
```

可以看到 pod 为 Running 状态，运行在 node 上。  
在 node 节点上查看：

```
# docker ps | grep busybox
ba5d1a480294        latelee/busybox                                      "sh"                     2 minutes ago       Up 2 minutes                            k8s_busybox_busybox_default_20d757f7-8ea7-4e51-93fc-514029065a59_0
8c643171ac09        registry.aliyuncs.com/google_containers/pause:3.1    "/pause"                 2 minutes ago       Up 2 minutes                            k8s_POD_busybox_default_20d757f7-8ea7-4e51-93fc-514029065a59_0
```

此时在 master 节点退出 busybox， pod 依旧存在，但不是 READY 状态，node 主机也没有 busybox 容器运行。

**验证通过，k8s 部署成功**。

## 六、其它

### 6.1 重置 k8s

```
root@ubuntu:~/k8s# kubeadm reset
[reset] Reading configuration from the cluster...
[reset] FYI: You can look at this config file with 'kubectl -n kube-system get cm kubeadm-config -oyaml'
[reset] WARNING: Changes made to this host by 'kubeadm init' or 'kubeadm join' will be reverted.
[reset] Are you sure you want to proceed? [y/N]: y  // !!! 输入y
[preflight] Running pre-flight checks
[reset] Removing info for node "ubuntu" from the ConfigMap "kubeadm-config" in the "kube-system" Namespace
W1215 11:50:28.154924    6848 removeetcdmember.go:61] [reset] failed to remove etcd member: error syncing endpoints with etc: etcdclient: no available endpoints
.Please manually remove this etcd member using etcdctl
[reset] Stopping the kubelet service
[reset] Unmounting mounted directories in "/var/lib/kubelet"
[reset] Deleting contents of config directories: [/etc/kubernetes/manifests /etc/kubernetes/pki]
[reset] Deleting files: [/etc/kubernetes/admin.conf /etc/kubernetes/kubelet.conf /etc/kubernetes/bootstrap-kubelet.conf /etc/kubernetes/controller-manager.conf /etc/kubernetes/scheduler.conf]
[reset] Deleting contents of stateful directories: [/var/lib/etcd /var/lib/kubelet /var/lib/dockershim /var/run/kubernetes /var/lib/cni]

The reset process does not clean CNI configuration. To do so, you must remove /etc/cni/net.d

The reset process does not reset or clean up iptables rules or IPVS tables.
If you wish to reset iptables, you must do so manually by using the "iptables" command.

If your cluster was setup to utilize IPVS, run ipvsadm --clear (or similar)
to reset your system's IPVS tables.

The reset process does not clean your kubeconfig files and you must remove them manually.
Please, check the contents of the $HOME/.kube/config file.
```

执行如下命令清除目录、删除网络设备：

```
rm -rf $HOME/.kube/config
rm -rf /var/lib/cni/
rm -rf /var/lib/kubelet/*
rm -rf /etc/kubernetes/
rm -rf /etc/cni/
ifconfig cni0 down
ifconfig flannel.1 down
ip link delete cni0
ip link delete flannel.1

```

### 6.2 节点机器退出

在 master 上执行：  
1、退出节点：

```
# kubectl drain node
node/node cordoned
evicting pod "busybox"  // 注：因有 pod 运行，故出现此信息
pod/busybox evicted
node/node evicted
```

此时提示：

```
# kubectl get nodes
NAME     STATUS                     ROLES    AGE   VERSION
node     Ready,SchedulingDisabled   <none>   18h   v1.17.0
ubuntu   Ready                      master   23h   v1.17.0
```

释义：  
node 已经变成不可调度状态了，但还是保持 Ready 状态（因为原本就是此状态）。可以理解为“禁止该节点的使用”。  
2、删除节点：

```
# kubectl delete node node
node "node" deleted
```

第二个 node 为节点名称。  
再查看已无 node 节点。

此时 node 节点的 flannel、kube-proxy 没有在运行：

```
# ps aux | grep kube
root       3269  1.6  4.3 754668 88712 ?        Ssl  Dec20  18:54 /usr/bin/kubelet --bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubelet.conf --kubeconfig=/etc/kubernetes/kubelet.conf --config=/var/lib/kubelet/config.yaml --cgroup-driver=cgroupfs --network-plugin=cni --pod-infra-container-image=registry.aliyuncs.com/google_containers/pause:3.1
root     124216  0.0  0.0  14228   964 pts/0    R+   00:49   0:00 grep --color=auto kube
```

在 node 上执行：

```
# kubeadm reset  // 输入 y 确认
```

执行如下命令清除目录、删除网络设备（注：与 master 有类似但又不同）：

```
ifconfig cni0 down
ip link delete cni0
ifconfig flannel.1 down
ip link delete flannel.1
rm /var/lib/cni/ -rf
rm /etc/kubernetes/ -rf
rm /var/lib/kubelet/ -rf
```

注：目前笔者尚未找到优雅退出 node 节点的方法。

### 备注

笔者在实践中发现，先加入集群，再退出、删除节点的配置，然后重新加入，前后尝试多次，均不成功。后新建虚拟机 Linux，改 docker，改主机名称，再从头下载 kubeadm、flannel、添加 admin.conf，最后加入群集，可以成功。（注：原因未知，待后续加深理解再回顾）。  
k8s 要进行的操作较多，可利用虚拟机快照功能，将步骤逐步保存，减少重复工作量。

## 待研究

在某个时刻，/etc/kubernetes/manifests 目录下有 yaml 文件。

```
# ls /etc/kubernetes/manifests/
etcd.yaml  kube-apiserver.yaml  kube-controller-manager.yaml  kube-scheduler.yaml
```

```
# cat /etc/kubernetes/manifests/etcd.yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    component: etcd
    tier: control-plane
  name: etcd
  namespace: kube-system
spec:
  containers:
  - command:
    - etcd
    - --advertise-client-urls=https://192.168.0.102:2379
    - --cert-file=/etc/kubernetes/pki/etcd/server.crt
    - --client-cert-auth=true
    - --data-dir=/var/lib/etcd
    - --initial-advertise-peer-urls=https://192.168.0.102:2380
    - --initial-cluster=ubuntu=https://192.168.0.102:2380
    - --key-file=/etc/kubernetes/pki/etcd/server.key
    - --listen-client-urls=https://127.0.0.1:2379,https://192.168.0.102:2379
    - --listen-metrics-urls=http://127.0.0.1:2381
    - --listen-peer-urls=https://192.168.0.102:2380
    - --name=ubuntu
    - --peer-cert-file=/etc/kubernetes/pki/etcd/peer.crt
    - --peer-client-cert-auth=true
    - --peer-key-file=/etc/kubernetes/pki/etcd/peer.key
    - --peer-trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt
    - --snapshot-count=10000
    - --trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt
    image: registry.aliyuncs.com/google_containers/etcd:3.4.3-0
    imagePullPolicy: IfNotPresent
    livenessProbe:
      failureThreshold: 8
      httpGet:
        host: 127.0.0.1
        path: /health
        port: 2381
        scheme: HTTP
      initialDelaySeconds: 15
      timeoutSeconds: 15
    name: etcd
    resources: {}
    volumeMounts:
    - mountPath: /var/lib/etcd
      name: etcd-data
    - mountPath: /etc/kubernetes/pki/etcd
      name: etcd-certs
  hostNetwork: true
  priorityClassName: system-cluster-critical
  volumes:
  - hostPath:
      path: /etc/kubernetes/pki/etcd
      type: DirectoryOrCreate
    name: etcd-certs
  - hostPath:
      path: /var/lib/etcd
      type: DirectoryOrCreate
    name: etcd-data
status: {}

# cat /etc/kubernetes/manifests/kube-apiserver.yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    component: kube-apiserver
    tier: control-plane
  name: kube-apiserver
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-apiserver
    - --advertise-address=192.168.0.102
    - --allow-privileged=true
    - --authorization-mode=Node,RBAC
    - --client-ca-file=/etc/kubernetes/pki/ca.crt
    - --enable-admission-plugins=NodeRestriction
    - --enable-bootstrap-token-auth=true
    - --etcd-cafile=/etc/kubernetes/pki/etcd/ca.crt
    - --etcd-certfile=/etc/kubernetes/pki/apiserver-etcd-client.crt
    - --etcd-keyfile=/etc/kubernetes/pki/apiserver-etcd-client.key
    - --etcd-servers=https://127.0.0.1:2379
    - --insecure-port=0
    - --kubelet-client-certificate=/etc/kubernetes/pki/apiserver-kubelet-client.crt
    - --kubelet-client-key=/etc/kubernetes/pki/apiserver-kubelet-client.key
    - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
    - --proxy-client-cert-file=/etc/kubernetes/pki/front-proxy-client.crt
    - --proxy-client-key-file=/etc/kubernetes/pki/front-proxy-client.key
    - --requestheader-allowed-names=front-proxy-client
    - --requestheader-client-ca-file=/etc/kubernetes/pki/front-proxy-ca.crt
    - --requestheader-extra-headers-prefix=X-Remote-Extra-
    - --requestheader-group-headers=X-Remote-Group
    - --requestheader-username-headers=X-Remote-User
    - --secure-port=6443
    - --service-account-key-file=/etc/kubernetes/pki/sa.pub
    - --service-cluster-ip-range=10.96.0.0/12
    - --tls-cert-file=/etc/kubernetes/pki/apiserver.crt
    - --tls-private-key-file=/etc/kubernetes/pki/apiserver.key
    image: registry.aliyuncs.com/google_containers/kube-apiserver:v1.17.0
    imagePullPolicy: IfNotPresent
    livenessProbe:
      failureThreshold: 8
      httpGet:
        host: 192.168.0.102
        path: /healthz
        port: 6443
        scheme: HTTPS
      initialDelaySeconds: 15
      timeoutSeconds: 15
    name: kube-apiserver
    resources:
      requests:
        cpu: 250m
    volumeMounts:
    - mountPath: /etc/ssl/certs
      name: ca-certs
      readOnly: true
    - mountPath: /etc/ca-certificates
      name: etc-ca-certificates
      readOnly: true
    - mountPath: /etc/pki
      name: etc-pki
      readOnly: true
    - mountPath: /etc/kubernetes/pki
      name: k8s-certs
      readOnly: true
    - mountPath: /usr/local/share/ca-certificates
      name: usr-local-share-ca-certificates
      readOnly: true
    - mountPath: /usr/share/ca-certificates
      name: usr-share-ca-certificates
      readOnly: true
  hostNetwork: true
  priorityClassName: system-cluster-critical
  volumes:
  - hostPath:
      path: /etc/ssl/certs
      type: DirectoryOrCreate
    name: ca-certs
  - hostPath:
      path: /etc/ca-certificates
      type: DirectoryOrCreate
    name: etc-ca-certificates
  - hostPath:
      path: /etc/pki
      type: DirectoryOrCreate
    name: etc-pki
  - hostPath:
      path: /etc/kubernetes/pki
      type: DirectoryOrCreate
    name: k8s-certs
  - hostPath:
      path: /usr/local/share/ca-certificates
      type: DirectoryOrCreate
    name: usr-local-share-ca-certificates
  - hostPath:
      path: /usr/share/ca-certificates
      type: DirectoryOrCreate
    name: usr-share-ca-certificates
status: {}

# cat /etc/kubernetes/manifests/kube-controller-manager.yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    component: kube-controller-manager
    tier: control-plane
  name: kube-controller-manager
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-controller-manager
    - --allocate-node-cidrs=true
    - --authentication-kubeconfig=/etc/kubernetes/controller-manager.conf
    - --authorization-kubeconfig=/etc/kubernetes/controller-manager.conf
    - --bind-address=127.0.0.1
    - --client-ca-file=/etc/kubernetes/pki/ca.crt
    - --cluster-cidr=10.244.0.0/16
    - --cluster-signing-cert-file=/etc/kubernetes/pki/ca.crt
    - --cluster-signing-key-file=/etc/kubernetes/pki/ca.key
    - --controllers=*,bootstrapsigner,tokencleaner
    - --kubeconfig=/etc/kubernetes/controller-manager.conf
    - --leader-elect=true
    - --node-cidr-mask-size=24
    - --requestheader-client-ca-file=/etc/kubernetes/pki/front-proxy-ca.crt
    - --root-ca-file=/etc/kubernetes/pki/ca.crt
    - --service-account-private-key-file=/etc/kubernetes/pki/sa.key
    - --service-cluster-ip-range=10.96.0.0/12
    - --use-service-account-credentials=true
    image: registry.aliyuncs.com/google_containers/kube-controller-manager:v1.17.0
    imagePullPolicy: IfNotPresent
    livenessProbe:
      failureThreshold: 8
      httpGet:
        host: 127.0.0.1
        path: /healthz
        port: 10257
        scheme: HTTPS
      initialDelaySeconds: 15
      timeoutSeconds: 15
    name: kube-controller-manager
    resources:
      requests:
        cpu: 200m
    volumeMounts:
    - mountPath: /etc/ssl/certs
      name: ca-certs
      readOnly: true
    - mountPath: /etc/ca-certificates
      name: etc-ca-certificates
      readOnly: true
    - mountPath: /etc/pki
      name: etc-pki
      readOnly: true
    - mountPath: /usr/libexec/kubernetes/kubelet-plugins/volume/exec
      name: flexvolume-dir
    - mountPath: /etc/kubernetes/pki
      name: k8s-certs
      readOnly: true
    - mountPath: /etc/kubernetes/controller-manager.conf
      name: kubeconfig
      readOnly: true
    - mountPath: /usr/local/share/ca-certificates
      name: usr-local-share-ca-certificates
      readOnly: true
    - mountPath: /usr/share/ca-certificates
      name: usr-share-ca-certificates
      readOnly: true
  hostNetwork: true
  priorityClassName: system-cluster-critical
  volumes:
  - hostPath:
      path: /etc/ssl/certs
      type: DirectoryOrCreate
    name: ca-certs
  - hostPath:
      path: /etc/ca-certificates
      type: DirectoryOrCreate
    name: etc-ca-certificates
  - hostPath:
      path: /etc/pki
      type: DirectoryOrCreate
    name: etc-pki
  - hostPath:
      path: /usr/libexec/kubernetes/kubelet-plugins/volume/exec
      type: DirectoryOrCreate
    name: flexvolume-dir
  - hostPath:
      path: /etc/kubernetes/pki
      type: DirectoryOrCreate
    name: k8s-certs
  - hostPath:
      path: /etc/kubernetes/controller-manager.conf
      type: FileOrCreate
    name: kubeconfig
  - hostPath:
      path: /usr/local/share/ca-certificates
      type: DirectoryOrCreate
    name: usr-local-share-ca-certificates
  - hostPath:
      path: /usr/share/ca-certificates
      type: DirectoryOrCreate
    name: usr-share-ca-certificates
status: {}

# cat /etc/kubernetes/manifests/kube-scheduler.yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    component: kube-scheduler
    tier: control-plane
  name: kube-scheduler
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-scheduler
    - --authentication-kubeconfig=/etc/kubernetes/scheduler.conf
    - --authorization-kubeconfig=/etc/kubernetes/scheduler.conf
    - --bind-address=127.0.0.1
    - --kubeconfig=/etc/kubernetes/scheduler.conf
    - --leader-elect=true
    image: registry.aliyuncs.com/google_containers/kube-scheduler:v1.17.0
    imagePullPolicy: IfNotPresent
    livenessProbe:
      failureThreshold: 8
      httpGet:
        host: 127.0.0.1
        path: /healthz
        port: 10259
        scheme: HTTPS
      initialDelaySeconds: 15
      timeoutSeconds: 15
    name: kube-scheduler
    resources:
      requests:
        cpu: 100m
    volumeMounts:
    - mountPath: /etc/kubernetes/scheduler.conf
      name: kubeconfig
      readOnly: true
  hostNetwork: true
  priorityClassName: system-cluster-critical
  volumes:
  - hostPath:
      path: /etc/kubernetes/scheduler.conf
      type: FileOrCreate
    name: kubeconfig
status: {}

```

运行服务：

```
# ps aux | grep kube
root      30720  0.4  2.1 144300 43752 ?        Ssl  10:08   1:43 kube-scheduler --authentication-kubeconfig=/etc/kubernetes/scheduler.conf --authorization-kubeconfig=/etc/kubernetes/scheduler.conf --bind-address=127.0.0.1 --kubeconfig=/etc/kubernetes/scheduler.conf --leader-elect=true
root      30774  2.0  2.8 10612588 57832 ?      Ssl  10:08   7:22 etcd --advertise-client-urls=https://192.168.0.102:2379 --cert-file=/etc/kubernetes/pki/etcd/server.crt --client-cert-auth=true --data-dir=/var/lib/etcd --initial-advertise-peer-urls=https://192.168.0.102:2380 --initial-cluster=ubuntu=https://192.168.0.102:2380 --key-file=/etc/kubernetes/pki/etcd/server.key --listen-client-urls=https://127.0.0.1:2379,https://192.168.0.102:2379 --listen-metrics-urls=http://127.0.0.1:2381 --listen-peer-urls=https://192.168.0.102:2380 --name=ubuntu --peer-cert-file=/etc/kubernetes/pki/etcd/peer.crt --peer-client-cert-auth=true --peer-key-file=/etc/kubernetes/pki/etcd/peer.key --peer-trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt --snapshot-count=10000 --trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt
root      30804  4.0 14.4 495628 293028 ?       Ssl  10:08  14:50 kube-apiserver --advertise-address=192.168.0.102 --allow-privileged=true --authorization-mode=Node,RBAC --client-ca-file=/etc/kubernetes/pki/ca.crt --enable-admission-plugins=NodeRestriction --enable-bootstrap-token-auth=true --etcd-cafile=/etc/kubernetes/pki/etcd/ca.crt --etcd-certfile=/etc/kubernetes/pki/apiserver-etcd-client.crt --etcd-keyfile=/etc/kubernetes/pki/apiserver-etcd-client.key --etcd-servers=https://127.0.0.1:2379 --insecure-port=0 --kubelet-client-certificate=/etc/kubernetes/pki/apiserver-kubelet-client.crt --kubelet-client-key=/etc/kubernetes/pki/apiserver-kubelet-client.key --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname --proxy-client-cert-file=/etc/kubernetes/pki/front-proxy-client.crt --proxy-client-key-file=/etc/kubernetes/pki/front-proxy-client.key --requestheader-allowed-names=front-proxy-client --requestheader-client-ca-file=/etc/kubernetes/pki/front-proxy-ca.crt --requestheader-extra-headers-prefix=X-Remote-Extra- --requestheader-group-headers=X-Remote-Group --requestheader-username-headers=X-Remote-User --secure-port=6443 --service-account-key-file=/etc/kubernetes/pki/sa.pub --service-cluster-ip-range=10.96.0.0/12 --tls-cert-file=/etc/kubernetes/pki/apiserver.crt --tls-private-key-file=/etc/kubernetes/pki/apiserver.key
root      30811  1.8  4.4 209988 90312 ?        Ssl  10:08   6:40 kube-controller-manager --allocate-node-cidrs=true --authentication-kubeconfig=/etc/kubernetes/controller-manager.conf --authorization-kubeconfig=/etc/kubernetes/controller-manager.conf --bind-address=127.0.0.1 --client-ca-file=/etc/kubernetes/pki/ca.crt --cluster-cidr=10.244.0.0/16 --cluster-signing-cert-file=/etc/kubernetes/pki/ca.crt --cluster-signing-key-file=/etc/kubernetes/pki/ca.key --controllers=*,bootstrapsigner,tokencleaner --kubeconfig=/etc/kubernetes/controller-manager.conf --leader-elect=true --node-cidr-mask-size=24 --requestheader-client-ca-file=/etc/kubernetes/pki/front-proxy-ca.crt --root-ca-file=/etc/kubernetes/pki/ca.crt --service-account-private-key-file=/etc/kubernetes/pki/sa.key --service-cluster-ip-range=10.96.0.0/12 --use-service-account-credentials=true
root      30939  2.6  4.4 615392 91012 ?        Ssl  10:09   9:47 /usr/bin/kubelet --bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubelet.conf --kubeconfig=/etc/kubernetes/kubelet.conf --config=/var/lib/kubelet/config.yaml --cgroup-driver=systemd --network-plugin=cni --pod-infra-container-image=registry.aliyuncs.com/google_containers/pause:3.1
root      31086  0.0  1.5 140100 30500 ?        Ssl  10:09   0:11 /usr/local/bin/kube-proxy --config=/var/lib/kube-proxy/config.conf --hostname-override=ubuntu
root      31441  0.0  1.3 390960 27068 ?        Ssl  10:13   0:17 /opt/bin/flanneld --ip-masq --kube-subnet-mgr
root      94375  0.0  0.0  14224   972 pts/0    R+   16:16   0:00 grep --color=auto kube
```

## 参考资源

本文部署时主要参考如下文章并根据实际情况调整：

- https://juejin.im/post/5b8a4536e51d4538c545645c
- https://zhuanlan.zhihu.com/p/46341911
- https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/ （官方）
