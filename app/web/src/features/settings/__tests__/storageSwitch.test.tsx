import {act,renderHook} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {useSettingsConfig} from '../hooks/useSettingsConfig';
import {storageProviderError} from '../storageValidation';
it('isolates provider drafts and does not persist selection before save',()=>{
 localStorage.setItem('storage_provider','oss');
 const {result}=renderHook(()=>useSettingsConfig({isOpen:false,showToast:vi.fn()}));
 act(()=>{result.current.setStorageEndpoint('https://oss-cn-beijing.aliyuncs.com');result.current.setStorageAccessKeyId('oss-key');result.current.setStorageSecretAccessKey('test-secret');result.current.setStorageBucketName('oss-bucket');});
 act(()=>result.current.setStorageProvider('cos'));
 expect(result.current.storageEndpoint).toBe('');expect(result.current.storageSecretAccessKey).toBe('');expect(localStorage.getItem('storage_provider')).toBe('oss');
 act(()=>result.current.setStorageEndpoint('https://cos.ap-guangzhou.myqcloud.com'));
 act(()=>result.current.setStorageProvider('oss'));
 expect(result.current.storageEndpoint).toBe('https://oss-cn-beijing.aliyuncs.com');expect(result.current.storageSecretAccessKey).toBe('test-secret');
 act(()=>result.current.setStorageProvider('cos'));
 expect(result.current.storageEndpoint).toBe('https://cos.ap-guangzhou.myqcloud.com');
});
it('rejects crossed provider endpoints',()=>{
 expect(storageProviderError('cos','https://oss-cn-beijing.aliyuncs.com')).toContain('阿里云');
 expect(storageProviderError('oss','https://cos.ap-guangzhou.myqcloud.com')).toContain('腾讯云');
 expect(storageProviderError('cos','https://cos.ap-guangzhou.myqcloud.com')).toBe('');
});
