import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { Switch } from '@/components/ui/switch';
import { Kbd } from '@/components/ui/kbd';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
} from '@/components/ui/context-menu';

export default function Gallery() {
  return (
    <TooltipProvider>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 font-mono text-sm">
        <h1 className="text-lg font-bold tracking-caps text-hi">gallery</h1>

        <section>
          <h2 className="text-xs uppercase tracking-caps text-muted">button</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button>default</Button>
            <Button variant="outline">outline</Button>
            <Button variant="ghost">ghost</Button>
            <Button variant="secondary">secondary</Button>
            <Button variant="destructive">destructive</Button>
            <Button disabled>disabled</Button>
          </div>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-caps text-muted">input + label</h2>
          <div className="mt-2 max-w-xs space-y-2">
            <Label htmlFor="x">label</Label>
            <Input id="x" placeholder="placeholder" />
          </div>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-caps text-muted">badge (also used as filter pill)</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>default</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge className="uppercase tracking-caps">pill</Badge>
          </div>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-caps text-muted">tabs</h2>
          <Tabs defaultValue="a" className="mt-2">
            <TabsList>
              <TabsTrigger value="a">a</TabsTrigger>
              <TabsTrigger value="b">b</TabsTrigger>
            </TabsList>
            <TabsContent value="a">content a</TabsContent>
            <TabsContent value="b">content b</TabsContent>
          </Tabs>
        </section>

        <section className="flex items-center gap-4">
          <Toggle>toggle</Toggle>
          <Switch />
          <Kbd>Cmd</Kbd><Kbd>K</Kbd>
        </section>

        <Separator />

        <section>
          <h2 className="text-xs uppercase tracking-caps text-muted">command</h2>
          <Command className="mt-2 max-w-sm border border-border">
            <CommandInput placeholder="search" />
            <CommandList>
              <CommandEmpty>no results</CommandEmpty>
              <CommandGroup heading="suggestions">
                <CommandItem>blob inclusion</CommandItem>
                <CommandItem>block propagation</CommandItem>
                <CommandItem>mempool visibility</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-caps text-muted">context menu (right-click the box)</h2>
          <ContextMenu>
            <ContextMenuTrigger className="mt-2 inline-flex h-12 w-48 items-center justify-center border border-border">
              right-click
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>open</ContextMenuItem>
              <ContextMenuItem>copy</ContextMenuItem>
              <ContextMenuItem>delete</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </section>

        <section className="flex flex-wrap gap-4">
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>dialog title</DialogTitle></DialogHeader>
              <p className="font-sans text-sm">Body.</p>
            </DialogContent>
          </Dialog>

          <Popover>
            <PopoverTrigger asChild><Button variant="outline">popover</Button></PopoverTrigger>
            <PopoverContent className="font-sans text-sm">Body.</PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild><Button variant="outline">tooltip</Button></TooltipTrigger>
            <TooltipContent>hi</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline">menu</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>one</DropdownMenuItem>
              <DropdownMenuItem>two</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </section>
      </div>
    </TooltipProvider>
  );
}
