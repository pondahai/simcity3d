#!/usr/bin/env python3
head = open('part1_head.html').read().rstrip()
head = head[:head.rindex('</body>')]
js = ''.join(open(f).read()+'\n' for f in
    ['part2_sim.js','part3_render.js','part4_input.js','part5_ui.js'])
out = (head
  + '\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n'
  + '<script>\n' + js + '</script>\n</body>\n</html>\n')
open('立體模擬城市.html','w').write(out)
print('OK ->', '立體模擬城市.html', len(out), 'bytes')
