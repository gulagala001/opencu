import hashlib, json, os, subprocess, tarfile, time, zipfile
from pathlib import Path

root = Path(os.environ['SOURCE_DIR']).resolve()
repo = os.environ['SOURCE_REPOSITORY']
sha = os.environ['SOURCE_SHA']
tag = os.environ['RELEASE_TAG']
required = json.loads(os.environ['REQUIRED_CHECKS'])
out = root.parent / 'release-assets'
out.mkdir(exist_ok=True)

def run(args, cwd=root, check=True):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, timeout=180)
    if check and result.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(args[:4]) + '\n' + result.stdout[-5000:] + result.stderr[-5000:])
    return result
def api(path):
    return json.loads(run(['gh', 'api', path]).stdout)
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

assert run(['git', 'rev-parse', 'HEAD']).stdout.strip() == sha
assert api('repos/' + repo + '/branches/main')['commit']['sha'] == sha
pkg = json.loads((root / 'package.json').read_text())
assert tag == 'v' + pkg['version']
if pkg['name'] == 'trisoul_x':
    receipt = json.loads((root / 'vendor/opencu.json').read_text())
    for name, expected in receipt['files'].items():
        assert digest(root / 'vendor/opencu' / name) == expected, name
    assert any(item['repo'] == 'gulagala001/opencu' and item['sha'] == receipt['commit'] for item in required)
    protected = ['src/config.mjs', 'src/frequency.mjs', 'src/prompts.mjs', 'src/context/prompts.mjs', 'src/cc-adaptation', 'src/tasks.mjs', 'src/todolist.mjs', 'presets', 'cordis.patch.yml']
    assert not run(['git', 'diff', '--name-only', 'b85d43e80426feaa48b3aa05d7f3f228149f1c25', sha, '--', *protected]).stdout.strip()

end = time.monotonic() + 1500
last = None
while time.monotonic() < end:
    evidence = []
    for item in required:
        rows = api('repos/' + item['repo'] + '/actions/runs?head_sha=' + item['sha'] + '&event=push&per_page=100')['workflow_runs']
        matches = [r for r in rows if r['head_sha'] == item['sha'] and r['name'] == item['workflow'] and r['head_branch'] == 'main']
        current = max(matches, key=lambda r: r['id']) if matches else None
        evidence.append({**item, 'status': current['status'] if current else 'missing', 'conclusion': current['conclusion'] if current else None, 'url': current['html_url'] if current else None})
    (out / 'verification.json').write_text(json.dumps({'source': sha, 'checks': evidence}, indent=2) + '\n')
    state = [(e['workflow'], e['status'], e['conclusion']) for e in evidence]
    if state != last:
        print(json.dumps(state), flush=True)
        last = state
    failed = [e for e in evidence if e['status'] == 'completed' and e['conclusion'] != 'success']
    if failed:
        raise RuntimeError('Release held: ' + json.dumps(failed))
    if all(e['status'] == 'completed' and e['conclusion'] == 'success' for e in evidence):
        break
    time.sleep(20)
else:
    raise TimeoutError('Verification is still pending; nothing was published')

assert api('repos/' + repo + '/branches/main')['commit']['sha'] == sha
name = repo.split('/')[-1] + '-' + tag
run(['git', 'archive', '--format=zip', '--prefix=' + name + '/', '-o', str(out / (name + '.zip')), sha])
packed = json.loads(run(['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', str(out)]).stdout)[0]
if pkg['name'] == 'trisoul_x':
    installed = run(['pnpm', 'install', '--frozen-lockfile'], check=False)
    (out / 'dependency-install.log').write_text(installed.stdout + installed.stderr)
    assert installed.returncode == 0, 'Release smoke-test dependency installation failed'
    test_source = (root / 'test/dsh-install.test.mjs').read_text()
    start = test_source.index('  const source = process.env.GITHUB_REPOSITORY')
    stop = test_source.index("  runCli(['plugin'", start)
    smoke = root / 'test/release-tgz-validation.mjs'
    assert not smoke.exists()
    try:
        smoke.write_text(test_source[:start] + '  const source = ' + json.dumps('file:' + str(out / packed['filename'])) + ';\n' + test_source[stop:])
        result = run(['node', '--test', str(smoke)], check=False)
        (out / 'installation-smoke.log').write_text(result.stdout + result.stderr)
        assert result.returncode == 0, 'The actual release TGZ did not pass stock-profile installation, restart and removal'
    finally:
        smoke.unlink(missing_ok=True)
    (out / 'dependency-install.log').unlink()
blocked = {'AGENTS.md', 'COMPUTER_USE_HANDOFF.md', 'COMPUTER_USE_BASELINE.md', 'PROMPT_CHANGES.md', 'WINDOWS_HANDOFF.md', '.credentials.yaml', '.env'}
with zipfile.ZipFile(out / (name + '.zip')) as z:
    assert z.testzip() is None
    names = z.namelist()
with tarfile.open(out / packed['filename']) as t:
    names += t.getnames()
    assert all(m.isfile() or m.isdir() for m in t.getmembers())
assert not [n for n in names if Path(n).name in blocked or '/node_modules/' in n or '/data/dsh/' in n]
notes = [f'# {name}', '', '本次提交完成既定范围的优化、DSH alpha.2 适配及兼容修复，以下检查均已通过。', '', '## 验证', *['- ' + e['repo'] + ' / ' + e['workflow'] + ': ' + e['url'] for e in evidence], '', '## 功能与数据', '保留既有工具、权限、提示词、任务、附件、上下文与设置的作用。Windows 初始化仅处理新建空白页；用户网址单次发送，取消或真实错误不会触发重试。测试通过不是对所有硬件、网站、模型和未来上游版本的零缺陷保证。', '', '源码 ZIP 含预构建界面，不含 node_modules、真实会话或凭据；TGZ 是插件安装包。升级前保留原 DSH_HOME、profile 与数据，并备份。', '官方浏览器入口是独立预览，不替代完整 CU 控制链路，也不保证共享登录状态。']
if pkg['name'] == 'trisoul_x':
    patch = root / 'docs/upstream-patches/dsh-alpha2-release-output.patch'
    (out / patch.name).write_bytes(patch.read_bytes())
    notes += ['', '完整范围见 docs/release-0.1.6-alpha.2.1-scope.md；误删报告与补丁边界见 docs/upstream-patches/README.md。打包补丁不会自动修改另行安装的全局 DSH。历史 1.3.0-alpha.* 属于旧编号，首次升级请使用本 tag。']
notes += ['', '## 安装', '```sh', f'dsh plugin --profile web add github:{repo}#{tag}', '```', '自定义 profile 使用原名称；宿主先按原安装方式升级到 DSH 0.1.6-alpha.2。']
(out / 'RELEASE-NOTES.md').write_text('\n'.join(notes) + '\n')
assets = sorted(p for p in out.iterdir() if p.is_file() and p.name != 'SHA256SUMS')
(out / 'SHA256SUMS').write_text(''.join(digest(p) + '  ' + p.name + '\n' for p in assets))
assets.append(out / 'SHA256SUMS')
tag_ref = run(['gh', 'api', 'repos/' + repo + '/git/ref/tags/' + tag], check=False)
if tag_ref.returncode == 0:
    obj = json.loads(tag_ref.stdout)['object']
    while obj['type'] == 'tag':
        obj = api('repos/' + repo + '/git/tags/' + obj['sha'])['object']
    assert obj['type'] == 'commit' and obj['sha'] == sha, 'Do not move an existing tag'
elif '404' not in tag_ref.stderr:
    raise RuntimeError(tag_ref.stderr)
existing = run(['gh', 'release', 'view', tag, '-R', repo, '--json', 'isDraft,targetCommitish'], check=False)
if existing.returncode == 0:
    assert json.loads(existing.stdout)['isDraft'], 'Never overwrite an already-public release'
    run(['gh', 'release', 'edit', tag, '-R', repo, '--target', sha])
else:
    run(['gh', 'release', 'create', tag, '-R', repo, '--target', sha, '--draft', '--prerelease', '--title', name, '--notes-file', str(out / 'RELEASE-NOTES.md')])
run(['gh', 'release', 'upload', tag, '-R', repo, '--clobber', *map(str, assets)])
current = json.loads(run(['gh', 'release', 'view', tag, '-R', repo, '--json', 'isDraft,targetCommitish,assets']).stdout)
assert current['isDraft'] and current['targetCommitish'] == sha
expected = {p.name: 'sha256:' + digest(p) for p in assets}
for asset in current['assets']:
    assert asset['name'] in expected and asset['state'] == 'uploaded' and asset['digest'] == expected[asset['name']], asset['name']
assert len(current['assets']) == len(expected)
run(['gh', 'release', 'edit', tag, '-R', repo, '--draft=false', '--prerelease', '--title', name, '--notes-file', str(out / 'RELEASE-NOTES.md')])
released = json.loads(run(['gh', 'release', 'view', tag, '-R', repo, '--json', 'isDraft,url']).stdout)
assert released['isDraft'] is False
obj = api('repos/' + repo + '/git/ref/tags/' + tag)['object']
while obj['type'] == 'tag':
    obj = api('repos/' + repo + '/git/tags/' + obj['sha'])['object']
assert obj['type'] == 'commit' and obj['sha'] == sha
print('PUBLISHED', released['url'], flush=True)
