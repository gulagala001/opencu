#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Security's signing SPI is build-time only; no keychain or trust settings are changed.
typedef CFTypeRef SecCodeSignerRef;
extern const CFStringRef kSecCodeSignerIdentity;
extern const CFStringRef kSecCodeSignerRequireTimestamp;
extern OSStatus SecCodeSignerCreate(CFDictionaryRef, SecCSFlags, SecCodeSignerRef *);
extern OSStatus SecCodeSignerAddSignatureWithErrors(SecCodeSignerRef, SecStaticCodeRef, SecCSFlags, CFErrorRef *);

static CFDataRef readData(const char *path) {
    FILE *file = fopen(path, "rb");
    if (!file) { perror(path); return NULL; }
    CFMutableDataRef data = CFDataCreateMutable(NULL, 0);
    UInt8 buffer[4096]; size_t count;
    while ((count = fread(buffer, 1, sizeof(buffer), file))) CFDataAppendBytes(data, buffer, count);
    if (ferror(file)) { perror(path); CFRelease(data); data = NULL; }
    fclose(file);
    return data;
}

int main(int argc, char **argv) {
    if (argc != 4) { fprintf(stderr, "Usage: macos-sign-local private-key.der certificate.der bundle.app\n"); return 2; }
    SecKeychainSetUserInteractionAllowed(false);
    CFDataRef keyData = readData(argv[1]), certificateData = readData(argv[2]);
    if (!keyData || !certificateData) return 1;
    const void *keyNames[] = {kSecAttrKeyType, kSecAttrKeyClass};
    const void *keyValues[] = {kSecAttrKeyTypeRSA, kSecAttrKeyClassPrivate};
    CFDictionaryRef attributes = CFDictionaryCreate(NULL, keyNames, keyValues, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFErrorRef error = NULL;
    SecKeyRef key = SecKeyCreateWithData(keyData, attributes, &error);
    SecCertificateRef certificate = SecCertificateCreateWithData(NULL, certificateData);
    SecIdentityRef (*createIdentity)(CFAllocatorRef, SecCertificateRef, SecKeyRef) = dlsym(RTLD_DEFAULT, "SecIdentityCreate");
    if (!key || !certificate || !createIdentity) {
        if (error) CFShow(error);
        fprintf(stderr, "Could not load the persistent local signing identity.\n");
        return 1;
    }
    SecIdentityRef identity = createIdentity(NULL, certificate, key);
    if (!identity) { fprintf(stderr, "The signing key does not match the certificate.\n"); return 1; }
    const void *names[] = {kSecCodeSignerIdentity, kSecCodeSignerRequireTimestamp};
    const void *values[] = {identity, kCFBooleanFalse};
    CFDictionaryRef parameters = CFDictionaryCreate(NULL, names, values, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    SecCodeSignerRef signer = NULL; SecStaticCodeRef code = NULL;
    CFURLRef url = CFURLCreateFromFileSystemRepresentation(NULL, (const UInt8 *)argv[3], strlen(argv[3]), true);
    OSStatus status = SecCodeSignerCreate(parameters, 0, &signer);
    if (!status) status = SecStaticCodeCreateWithPath(url, 0, &code);
    if (!status) status = SecCodeSignerAddSignatureWithErrors(signer, code, 0, &error);
    if (status) {
        if (error) CFShow(error);
        fprintf(stderr, "Local code signing failed (%d).\n", (int)status);
    }
    if (code) CFRelease(code);
    if (signer) CFRelease(signer);
    if (error) CFRelease(error);
    CFRelease(url); CFRelease(parameters); CFRelease(identity);
    CFRelease(certificate); CFRelease(key); CFRelease(attributes);
    CFRelease(certificateData); CFRelease(keyData);
    return status ? 1 : 0;
}
