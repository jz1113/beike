export function storageProviderError(provider:string,endpoint:string) {
  let host:string;
  try {host=new URL(endpoint.trim()).hostname.toLowerCase();}catch{return '请填写有效的对象存储 Endpoint URL';}
  if(provider==='cos' && /(^|\.)aliyuncs\.com$/.test(host))return '当前选择腾讯云 COS，但端点仍是阿里云 OSS，请填写腾讯云的端点及配套密钥';
  if(provider==='oss' && /(^|\.)myqcloud\.com$/.test(host))return '当前选择阿里云 OSS，但端点仍是腾讯云 COS，请填写阿里云的端点及配套密钥';
  return '';
}
